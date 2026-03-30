/**
 * @module routes/widgetSettings
 * Widget token management: generate, get (masked), update domains/greeting, revoke, regenerate.
 */
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { WidgetToken } from "../models/WidgetToken";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const widgetSettingsRouter = Router();

const UpdateBody = z.object({
  allowedDomains: z.array(z.string().url()).optional(),
  greeting: z.string().min(1).max(500).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({ tags: ["Widget Settings"], method: "post", path: "/api/v1/settings/widget-token", description: "Generate a widget token for embedding. Returns the token ONCE.", responses: { 201: { description: "Created" }, 409: { description: "Token already exists" } } });
registry.registerPath({ tags: ["Widget Settings"], method: "get", path: "/api/v1/settings/widget-token", description: "Get current widget token config (token masked).", responses: { 200: { description: "OK" }, 404: { description: "No token" } } });
registry.registerPath({ tags: ["Widget Settings"], method: "put", path: "/api/v1/settings/widget-token", description: "Update widget settings (domains, greeting, position).", request: { body: { content: { "application/json": { schema: UpdateBody } } } }, responses: { 200: { description: "Updated" } } });
registry.registerPath({ tags: ["Widget Settings"], method: "delete", path: "/api/v1/settings/widget-token", description: "Revoke widget token.", responses: { 200: { description: "Revoked" } } });

/* ---------- Routes ---------- */

// POST generate widget token
widgetSettingsRouter.post("/widget-token", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const existing = await WidgetToken.findOne({ tenantId: asObjectId(auth.tid), isActive: true });
  if (existing) return res.status(409).json({ error: "token_exists", message: "A widget token already exists. Revoke it first to generate a new one." });

  const token = `pub_${randomBytes(24).toString("hex")}`;
  const wt = await WidgetToken.create({
    tenantId: asObjectId(auth.tid),
    token,
    createdBy: asObjectId(auth.sub),
  });

  return res.status(201).json({
    data: { _id: wt._id, token, allowedDomains: wt.allowedDomains, greeting: wt.greeting, position: wt.position, isActive: wt.isActive },
  });
});

// GET current widget token (masked)
widgetSettingsRouter.get("/widget-token", requireAuth, requirePermission("SETTINGS_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const wt = await WidgetToken.findOne({ tenantId: asObjectId(auth.tid), isActive: true })
    .select("token allowedDomains greeting position isActive createdAt")
    .lean();
  if (!wt) return res.status(404).json({ error: "no_widget_token" });

  // Mask token: show first 8 chars + asterisks
  const masked = wt.token.slice(0, 8) + "****" + wt.token.slice(-4);

  res.json({ data: { ...wt, token: masked } });
});

// PUT update widget settings
widgetSettingsRouter.put("/widget-token", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.allowedDomains !== undefined) update.allowedDomains = body.allowedDomains;
    if (body.greeting !== undefined) update.greeting = body.greeting;
    if (body.position !== undefined) update.position = body.position;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: "no_changes" });

    const wt = await WidgetToken.findOneAndUpdate(
      { tenantId: asObjectId(auth.tid), isActive: true },
      { $set: update },
      { new: true }
    ).select("allowedDomains greeting position isActive");
    if (!wt) return res.status(404).json({ error: "no_widget_token" });
    res.json({ data: wt });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE revoke widget token
widgetSettingsRouter.delete("/widget-token", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await WidgetToken.findOneAndUpdate(
    { tenantId: asObjectId(auth.tid), isActive: true },
    { isActive: false },
    { new: true }
  );
  if (!result) return res.status(404).json({ error: "no_widget_token" });
  res.json({ ok: true });
});
