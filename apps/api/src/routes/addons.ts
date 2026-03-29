/**
 * @module routes/addons
 * Add-on management for tenants: list available, activate, list active, cancel.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { AddOn, DEFAULT_ADDONS } from "../models/AddOn";
import { TenantAddOn } from "../models/TenantAddOn";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const addonsRouter = Router();

/* ---------- OpenAPI ---------- */

registry.registerPath({
  tags: ["Add-ons"],
  method: "get",
  path: "/api/v1/add-ons/available",
  description: "List all available add-ons with pricing.",
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Add-ons"],
  method: "get",
  path: "/api/v1/add-ons",
  description: "List active add-ons for the current tenant.",
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Add-ons"],
  method: "post",
  path: "/api/v1/add-ons",
  description: "Activate an add-on for the current tenant.",
  request: { body: { content: { "application/json": { schema: z.object({ code: z.string(), quantity: z.number().int().min(1).optional() }) } } } },
  responses: { 201: { description: "Activated" }, 400: { description: "Invalid add-on" }, 409: { description: "Already active" } },
});

registry.registerPath({
  tags: ["Add-ons"],
  method: "delete",
  path: "/api/v1/add-ons/{code}",
  description: "Cancel an active add-on.",
  request: { params: z.object({ code: z.string() }) },
  responses: { 200: { description: "Canceled" }, 404: { description: "Not found" } },
});

/* ---------- Seed helper ---------- */

async function ensureAddOnsSeeded() {
  const count = await AddOn.countDocuments();
  if (count === 0) {
    await AddOn.insertMany(DEFAULT_ADDONS);
  }
}

/* ---------- Routes ---------- */

// GET available add-ons (public catalog)
addonsRouter.get("/available", requireAuth, async (_req, res) => {
  await ensureAddOnsSeeded();
  const addons = await AddOn.find({ isActive: true }).select("code name priceCentsMonthly description").lean();
  res.json({ data: addons });
});

// GET active add-ons for tenant
addonsRouter.get("/", requireAuth, requirePermission("BILLING_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const active = await TenantAddOn.find({ tenantId: asObjectId(auth.tid), canceledAt: null }).lean();
  res.json({ data: active });
});

// POST activate add-on
addonsRouter.post("/", requireAuth, requirePermission("BILLING_MANAGE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = z.object({ code: z.string().min(1), quantity: z.number().int().min(1).default(1) }).parse(req.body);

    await ensureAddOnsSeeded();
    const addon = await AddOn.findOne({ code: body.code, isActive: true });
    if (!addon) return res.status(400).json({ error: "invalid_addon", message: "Add-on not found or inactive" });

    // Check if already active
    const existing = await TenantAddOn.findOne({ tenantId: asObjectId(auth.tid), addOnCode: body.code, canceledAt: null });
    if (existing) return res.status(409).json({ error: "already_active", message: "This add-on is already active" });

    const tenantAddOn = await TenantAddOn.create({
      tenantId: asObjectId(auth.tid),
      addOnCode: body.code,
      quantity: body.quantity,
    });

    return res.status(201).json({ data: tenantAddOn });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE cancel add-on
addonsRouter.delete("/:code", requireAuth, requirePermission("BILLING_MANAGE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await TenantAddOn.findOneAndUpdate(
    { tenantId: asObjectId(auth.tid), addOnCode: req.params.code, canceledAt: null },
    { canceledAt: new Date() },
    { new: true },
  );
  if (!result) return res.status(404).json({ error: "not_found", message: "Add-on not active" });
  res.json({ data: result });
});
