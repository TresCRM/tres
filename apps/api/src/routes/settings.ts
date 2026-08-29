/**
 * @module routes/settings
 * Tenant branding/settings management.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Tenant } from "../models/Tenant";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const settingsRouter = Router();

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color (#RRGGBB)");

const UpdateBrandingBody = z.object({
  name: z.string().min(1).max(200).optional(),
  primaryColor: HexColor.optional(),
  surfaceColor: HexColor.optional(),
  logoUrl: z.string().url().optional(),
  emailFrom: z.string().email().optional(),
});

registry.registerPath({
  tags: ["Settings"],
  method: "get",
  path: "/api/v1/settings/branding",
  description: "Get current tenant branding configuration.",
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Settings"],
  method: "put",
  path: "/api/v1/settings/branding",
  description: "Update tenant branding (logo, colors, display name).",
  request: { body: { content: { "application/json": { schema: UpdateBrandingBody } } } },
  responses: { 200: { description: "Updated" }, 400: { description: "Invalid input" } },
});

// GET branding
settingsRouter.get("/branding", requireAuth, requirePermission("SETTINGS_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenant = await Tenant.findById(asObjectId(auth.tid)).select("branding slug").lean();
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
  res.json({ data: { slug: tenant.slug, branding: tenant.branding } });
});

// PUT branding
settingsRouter.put("/branding", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateBrandingBody.parse(req.body);
    const update: any = {};
    if (body.name !== undefined) update["branding.name"] = body.name;
    if (body.primaryColor !== undefined) update["branding.primaryColor"] = body.primaryColor;
    if (body.surfaceColor !== undefined) update["branding.surfaceColor"] = body.surfaceColor;
    if (body.logoUrl !== undefined) update["branding.logoUrl"] = body.logoUrl;
    if (body.emailFrom !== undefined) update["branding.emailFrom"] = body.emailFrom;

    if (Object.keys(update).length === 0) return res.status(400).json({ error: "no_changes" });

    const tenant = await Tenant.findByIdAndUpdate(asObjectId(auth.tid), { $set: update }, { new: true }).select("branding slug").lean();
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
    res.json({ data: { slug: tenant.slug, branding: tenant.branding } });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST /test-email — send a test email to verify SMTP configuration
settingsRouter.post("/test-email", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  try {
    const { to } = z.object({ to: z.string().email() }).parse(req.body);
    const { sendTestEmail } = await import("../services/mailer");
    const result = await sendTestEmail(to);
    if (result.success) {
      return res.json({ ok: true, messageId: result.messageId });
    }
    return res.status(502).json({ error: "smtp_error", message: result.error });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request" });
    return res.status(500).json({ error: "internal_error" });
  }
});
