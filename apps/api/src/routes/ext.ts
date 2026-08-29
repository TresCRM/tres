/**
 * @module routes/ext
 * External API endpoints for third-party integrations.
 * Authenticated via API key (X-API-Key header), not JWT.
 * Scoped by key permissions: tickets:read, tickets:write, customers:read, customers:write.
 */
import { Router } from "express";
import { z } from "zod";
import { requireApiKey, requireScope } from "../middlewares/apiKeyAuth";
import type { ApiKeyRequest } from "../middlewares/apiKeyAuth";
import { asObjectId } from "../utils/auth";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Customer } from "../models/Customer";
import { sanitizeUserHtml } from "../utils/sanitize";
import { emitTicketEvent } from "../events/emitter";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const extRouter = Router();

/* ---------- Schemas ---------- */

const CreateTicketBody = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(1).max(50000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  customerEmail: z.string().email(),
  customerName: z.string().max(200).optional(),
  tags: z.array(z.string()).max(20).optional(),
  externalId: z.string().max(200).optional(),
});

const UpdateTicketBody = z.object({
  subject: z.string().min(3).max(200).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const CommentBody = z.object({
  body: z.string().min(1).max(50000),
  isAgent: z.boolean().default(true),
});

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_CUSTOMER", "TRANSFERRED", "RESOLVED", "CLOSED", "REOPENED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  customerEmail: z.string().optional(),
  externalId: z.string().optional(),
});

const CreateCustomerBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
});

const UpdateCustomerBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({ tags: ["External API"], method: "post", path: "/api/v1/ext/tickets", description: "Create ticket via API key.", request: { body: { content: { "application/json": { schema: CreateTicketBody } } } }, responses: { 201: { description: "Created" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "get", path: "/api/v1/ext/tickets", description: "List tickets via API key.", request: { query: ListQuery }, responses: { 200: { description: "OK" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "get", path: "/api/v1/ext/tickets/{id}", description: "Get ticket with comments via API key.", request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "OK" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "put", path: "/api/v1/ext/tickets/{id}", description: "Update ticket via API key.", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateTicketBody } } } }, responses: { 200: { description: "Updated" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "post", path: "/api/v1/ext/tickets/{id}/comments", description: "Add comment via API key.", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: CommentBody } } } }, responses: { 201: { description: "Created" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "post", path: "/api/v1/ext/tickets/{id}/close", description: "Close ticket via API key.", request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Closed" } }, security: [] });
registry.registerPath({ tags: ["External API"], method: "post", path: "/api/v1/ext/tickets/{id}/reopen", description: "Reopen ticket via API key.", request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Reopened" } }, security: [] });

/* ===================== TICKET ROUTES ===================== */

// POST create ticket
extRouter.post("/tickets", requireApiKey, requireScope("tickets:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  try {
    const body = CreateTicketBody.parse(req.body);
    const ticket = await Ticket.create({
      tenantId: asObjectId(ak.tid),
      subject: body.subject,
      body: sanitizeUserHtml(body.body),
      priority: body.priority,
      customerEmail: body.customerEmail.toLowerCase(),
      tags: body.tags,
      createdBy: asObjectId(ak.tid), // API key has no user; use tenant as creator
      requestId: body.externalId,
    });

    emitTicketEvent(ak.tid, { event: "ticket.created", ticketId: String(ticket._id), source: "api_key" });
    return res.status(201).json({ data: ticket });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    if (e.code === 11000) return res.status(409).json({ error: "duplicate_external_id" });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list tickets
extRouter.get("/tickets", requireApiKey, requireScope("tickets:read"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(ak.tid) };
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.customerEmail) filter.customerEmail = q.customerEmail.toLowerCase();
  if (q.externalId) filter.requestId = q.externalId;
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await Ticket.find(filter).sort({ _id: -1 }).limit(q.limit).lean();
  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
  res.json({ data: items, nextCursor });
});

// GET single ticket with comments
extRouter.get("/tickets/:id", requireApiKey, requireScope("tickets:read"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) }).lean();
  if (!ticket) return res.status(404).json({ error: "not_found" });
  const comments = await Comment.find({ ticketId: ticket._id }).sort({ createdAt: 1 }).lean();
  res.json({ data: { ...ticket, comments } });
});

// PUT update ticket
extRouter.put("/tickets/:id", requireApiKey, requireScope("tickets:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  try {
    const body = UpdateTicketBody.parse(req.body);
    const update: any = {};
    if (body.subject) update.subject = body.subject;
    if (body.priority) update.priority = body.priority;
    if (body.tags) update.tags = body.tags;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "no_changes" });

    const ticket = await Ticket.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) },
      { $set: update }, { new: true }
    );
    if (!ticket) return res.status(404).json({ error: "not_found" });
    res.json({ data: ticket });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST add comment
extRouter.post("/tickets/:id/comments", requireApiKey, requireScope("tickets:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  try {
    const body = CommentBody.parse(req.body);
    const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    const comment = await Comment.create({
      tenantId: asObjectId(ak.tid),
      ticketId: ticket._id,
      authorId: asObjectId(ak.tid),
      body: sanitizeUserHtml(body.body),
      isAgent: body.isAgent,
    });
    emitTicketEvent(ak.tid, { event: "ticket.replied", ticketId: String(ticket._id), source: "api_key" });
    return res.status(201).json({ data: comment });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST close ticket
extRouter.post("/tickets/:id/close", requireApiKey, requireScope("tickets:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const ticket = await Ticket.findOneAndUpdate(
    { _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid), status: { $ne: "CLOSED" } },
    { status: "CLOSED" }, { new: true }
  );
  if (!ticket) return res.status(404).json({ error: "not_found" });
  emitTicketEvent(ak.tid, { event: "ticket.closed", ticketId: String(ticket._id), source: "api_key", customerEmail: ticket.customerEmail, tenantId: ak.tid });
  res.json({ data: ticket });
});

// POST reopen ticket
extRouter.post("/tickets/:id/reopen", requireApiKey, requireScope("tickets:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) });
  if (!ticket) return res.status(404).json({ error: "not_found" });
  if (ticket.status !== "CLOSED") return res.status(400).json({ error: "invalid_status", message: "Only CLOSED tickets can be reopened" });
  ticket.status = "REOPENED";
  await ticket.save();
  emitTicketEvent(ak.tid, { event: "ticket.reopened", ticketId: String(ticket._id), source: "api_key" });
  res.json({ data: ticket });
});

/* ===================== CUSTOMER ROUTES ===================== */

// POST create/upsert customer
extRouter.post("/customers", requireApiKey, requireScope("customers:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  try {
    const body = CreateCustomerBody.parse(req.body);
    const customer = await Customer.findOneAndUpdate(
      { tenantId: asObjectId(ak.tid), email: body.email.toLowerCase() },
      { $set: { name: body.name, phone: body.phone, company: body.company }, $setOnInsert: { tenantId: asObjectId(ak.tid), email: body.email.toLowerCase() } },
      { new: true, upsert: true }
    );
    return res.status(201).json({ data: customer });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list customers
extRouter.get("/customers", requireApiKey, requireScope("customers:read"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;
  const filter: any = { tenantId: asObjectId(ak.tid) };
  if (cursor) filter._id = { $lt: asObjectId(cursor) };

  const items = await Customer.find(filter).sort({ _id: -1 }).limit(limit).lean();
  const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : undefined;
  res.json({ data: items, nextCursor });
});

// GET single customer
extRouter.get("/customers/:id", requireApiKey, requireScope("customers:read"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  const customer = await Customer.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) }).lean();
  if (!customer) return res.status(404).json({ error: "not_found" });
  res.json({ data: customer });
});

// PUT update customer
extRouter.put("/customers/:id", requireApiKey, requireScope("customers:write"), async (req, res) => {
  const ak = (req as ApiKeyRequest).apiKey;
  try {
    const body = UpdateCustomerBody.parse(req.body);
    const customer = await Customer.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(ak.tid) },
      { $set: body }, { new: true }
    );
    if (!customer) return res.status(404).json({ error: "not_found" });
    res.json({ data: customer });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});
