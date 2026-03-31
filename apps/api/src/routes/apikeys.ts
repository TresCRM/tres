/**
 * @module routes/apikeys
 * API key management: generate, list, update, revoke.
 * Keys are shown once on creation, stored as SHA-256 hashes.
 */
import { Router } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { ApiKey } from "../models/ApiKey";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const apikeysRouter = Router();

const VALID_SCOPES = ["tickets:read", "tickets:write", "customers:read", "customers:write", "staff:manage"];

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1).refine(
    scopes => scopes.every(s => VALID_SCOPES.includes(s)),
    { message: `Valid scopes: ${VALID_SCOPES.join(", ")}` }
  ),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).min(1).refine(
    scopes => scopes.every(s => VALID_SCOPES.includes(s)),
    { message: `Valid scopes: ${VALID_SCOPES.join(", ")}` }
  ).optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({
  tags: ["API Keys"],
  method: "post", path: "/api/v1/api-keys",
  description: "Generate a new API key. The full key is returned ONCE -- store it securely.",
  request: { body: { content: { "application/json": { schema: CreateBody } } } },
  responses: { 201: { description: "Key created (full key in response)" }, 400: { description: "Invalid scopes" } },
});
registry.registerPath({
  tags: ["API Keys"],
  method: "get", path: "/api/v1/api-keys",
  description: "List API keys for the tenant (prefix + name only, never full key).",
  responses: { 200: { description: "OK" } },
});
registry.registerPath({
  tags: ["API Keys"],
  method: "put", path: "/api/v1/api-keys/{id}",
  description: "Update API key name or scopes.",
  request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateBody } } } },
  responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
});
registry.registerPath({
  tags: ["API Keys"],
  method: "delete", path: "/api/v1/api-keys/{id}",
  description: "Revoke an API key (sets isActive to false).",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Revoked" }, 404: { description: "Not found" } },
});

/* ---------- Routes ---------- */

// POST generate key
apikeysRouter.post("/", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = CreateBody.parse(req.body);
    const rawKey = `tcrm_${randomBytes(32).toString("hex")}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await ApiKey.create({
      tenantId: asObjectId(auth.tid),
      name: body.name,
      prefix,
      keyHash,
      scopes: body.scopes,
      expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86400000) : undefined,
      createdBy: asObjectId(auth.sub),
    });

    return res.status(201).json({
      data: {
        _id: apiKey._id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      key: rawKey, // shown ONCE
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list keys (never show full key or hash)
apikeysRouter.get("/", requireAuth, requirePermission("SETTINGS_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const keys = await ApiKey.find({ tenantId: asObjectId(auth.tid) })
    .select("name prefix scopes isActive lastUsedAt expiresAt createdAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ data: keys });
});

// PUT update key
apikeysRouter.put("/:id", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.name) update.name = body.name;
    if (body.scopes) update.scopes = body.scopes;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "no_changes" });

    const key = await ApiKey.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: update },
      { new: true }
    ).select("name prefix scopes isActive expiresAt");
    if (!key) return res.status(404).json({ error: "not_found" });
    res.json({ data: key });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE revoke key
apikeysRouter.delete("/:id", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const key = await ApiKey.findOneAndUpdate(
    { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid), isActive: true },
    { isActive: false },
    { new: true }
  );
  if (!key) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
