/**
 * @module routes/webhooks
 * Webhook management: register, list, update, delete, test.
 */
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Webhook } from "../models/Webhook";
import { sendTestWebhook } from "../services/webhookDispatcher";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const webhooksRouter = Router();

const VALID_EVENTS = [
  // Ticket lifecycle
  "ticket.created", "ticket.assigned", "ticket.status_changed", "ticket.replied",
  "ticket.closed", "ticket.reopened", "ticket.merged", "ticket.linked",
  "ticket.sla_breach", "ticket.sla_warning", "ticket.ttl_reminder", "ticket.ttl_closed",
  "ticket.transferred", "ticket.escalated",
  // Customer lifecycle
  "customer.created", "customer.updated", "customer.deleted",
  // Team events
  "user.invited", "user.accepted", "user.removed", "user.role_changed",
  // Billing
  "subscription.created", "subscription.renewed", "subscription.expired",
  "subscription.canceled", "payment.succeeded", "payment.failed", "invoice.generated",
  // Chat
  "chat.started", "chat.ended", "chat.transferred",
  // Survey
  "survey.submitted",
];

const CreateBody = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1).refine(
    evts => evts.every(e => VALID_EVENTS.includes(e)),
    { message: `Valid events: ${VALID_EVENTS.join(", ")}` }
  ),
});

const UpdateBody = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).refine(
    evts => evts.every(e => VALID_EVENTS.includes(e)),
    { message: `Valid events: ${VALID_EVENTS.join(", ")}` }
  ).optional(),
  isActive: z.boolean().optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({ tags: ["Webhooks"], method: "post", path: "/api/v1/webhooks", description: "Register a webhook endpoint.", request: { body: { content: { "application/json": { schema: CreateBody } } } }, responses: { 201: { description: "Created" } } });
registry.registerPath({ tags: ["Webhooks"], method: "get", path: "/api/v1/webhooks", description: "List webhooks for the tenant.", responses: { 200: { description: "OK" } } });
registry.registerPath({ tags: ["Webhooks"], method: "put", path: "/api/v1/webhooks/{id}", description: "Update a webhook.", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateBody } } } }, responses: { 200: { description: "Updated" } } });
registry.registerPath({ tags: ["Webhooks"], method: "delete", path: "/api/v1/webhooks/{id}", description: "Delete a webhook.", request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Deleted" } } });
registry.registerPath({ tags: ["Webhooks"], method: "post", path: "/api/v1/webhooks/{id}/test", description: "Send a test ping to verify webhook connectivity.", request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Test result" } } });

/* ---------- Routes ---------- */

// POST register webhook
webhooksRouter.post("/", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = CreateBody.parse(req.body);
    const secret = randomBytes(32).toString("hex");

    const webhook = await Webhook.create({
      tenantId: asObjectId(auth.tid),
      url: body.url,
      secret,
      events: body.events,
      createdBy: asObjectId(auth.sub),
    });

    return res.status(201).json({
      data: {
        _id: webhook._id,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
      },
      secret, // shown ONCE, like API keys
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list webhooks
webhooksRouter.get("/", requireAuth, requirePermission("SETTINGS_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const webhooks = await Webhook.find({ tenantId: asObjectId(auth.tid) })
    .select("url events isActive failCount lastTriggeredAt lastFailedAt createdAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ data: webhooks });
});

// PUT update webhook
webhooksRouter.put("/:id", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.url) update.url = body.url;
    if (body.events) update.events = body.events;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.isActive === true) update.failCount = 0; // reset on re-enable
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "no_changes" });

    const webhook = await Webhook.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: update }, { new: true }
    ).select("url events isActive failCount lastTriggeredAt");
    if (!webhook) return res.status(404).json({ error: "not_found" });
    res.json({ data: webhook });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE webhook
webhooksRouter.delete("/:id", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await Webhook.deleteOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

// POST test webhook
webhooksRouter.post("/:id/test", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await sendTestWebhook(req.params.id, auth.tid);
  res.json({ data: result });
});
