/**
 * @module admin/routes/settings
 * Platform-level settings management (singleton config).
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { getSettings, PlatformSettings } from "../../models/PlatformSettings";
import type { AuthRequest } from "../../types/auth";
import { asObjectId } from "../../utils/auth";

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAdminAuth, adminAudit);

const UpdateBody = z.object({
  maintenanceMode: z.boolean().optional(),
  signupEnabled: z.boolean().optional(),
  defaultPlan: z.string().optional(),
  maxTenantsPerUser: z.number().min(1).max(100).optional(),
  supportEmail: z.string().email().optional(),
  platformName: z.string().min(1).max(200).optional(),
});

// GET current settings
adminSettingsRouter.get("/", requireAdminPermission("ADMIN_SETTINGS_READ"), async (_req, res) => {
  const settings = await getSettings();
  res.json({ data: settings });
});

// PUT update settings
adminSettingsRouter.put("/", requireAdminPermission("ADMIN_SETTINGS_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateBody.parse(req.body);
    const settings = await PlatformSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { ...body, updatedBy: asObjectId(auth.sub) } },
      { new: true, upsert: true }
    ).lean();
    res.json({ data: settings });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});
