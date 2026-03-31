/**
 * @module routes/customers
 * Customer CRUD with tenant scoping, pagination, search, and soft-delete.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Customer } from "../models/Customer";
import { sanitizeUserHtml } from "../utils/sanitize";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

/** Escape special regex characters to prevent ReDoS */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const customersRouter = Router();

/* ---------- Zod schemas ---------- */

const CreateCustomerBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

const UpdateCustomerBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  q: z.string().optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({
  tags: ["Customers"],
  method: "post",
  path: "/api/v1/customers",
  description: "Create a new customer in the tenant.",
  request: { body: { content: { "application/json": { schema: CreateCustomerBody } } } },
  responses: { 201: { description: "Created" }, 400: { description: "Bad Request" }, 409: { description: "Conflict (email exists)" } },
});

registry.registerPath({
  tags: ["Customers"],
  method: "get",
  path: "/api/v1/customers",
  description: "List customers with optional search and cursor pagination.",
  request: { query: ListQuery },
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Customers"],
  method: "get",
  path: "/api/v1/customers/{id}",
  description: "Get a single customer by ID.",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Customers"],
  method: "put",
  path: "/api/v1/customers/{id}",
  description: "Update a customer.",
  request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateCustomerBody } } } },
  responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Customers"],
  method: "delete",
  path: "/api/v1/customers/{id}",
  description: "Soft-delete a customer (sets isActive to false).",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
});

/* ---------- Routes ---------- */

// POST create
customersRouter.post("/", requireAuth, requirePermission("CUSTOMER_CREATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = CreateCustomerBody.parse(req.body);
    const existing = await Customer.findOne({ tenantId: asObjectId(auth.tid), email: body.email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "customer_exists", message: "A customer with this email already exists" });

    const customer = await Customer.create({
      tenantId: asObjectId(auth.tid),
      name: body.name,
      email: body.email.toLowerCase(),
      phone: body.phone,
      company: body.company,
    });
    return res.status(201).json({ data: customer });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list with search + cursor pagination
customersRouter.get("/", requireAuth, requirePermission("CUSTOMER_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };

  if (q.q) {
    const safeQ = escapeRegex(q.q);
    filter.$or = [
      { name: { $regex: safeQ, $options: "i" } },
      { email: { $regex: safeQ, $options: "i" } },
      { company: { $regex: safeQ, $options: "i" } },
    ];
  }
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await Customer.find(filter).sort({ _id: -1 }).limit(q.limit).lean();
  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
  res.json({ data: items, nextCursor });
});

// GET single
customersRouter.get("/:id", requireAuth, requirePermission("CUSTOMER_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const customer = await Customer.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) }).lean();
  if (!customer) return res.status(404).json({ error: "not_found" });
  res.json({ data: customer });
});

// PUT update
customersRouter.put("/:id", requireAuth, requirePermission("CUSTOMER_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateCustomerBody.parse(req.body);
    const customer = await Customer.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: body },
      { new: true }
    );
    if (!customer) return res.status(404).json({ error: "not_found" });
    res.json({ data: customer });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE soft-delete
customersRouter.delete("/:id", requireAuth, requirePermission("CUSTOMER_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await Customer.deleteOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
