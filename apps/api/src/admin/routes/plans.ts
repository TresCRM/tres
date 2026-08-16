/**
 * @module admin/routes/plans
 * Admin plan catalog management — overrides for the hardcoded PLANS catalog.
 *
 * The canonical plan catalog lives in billing/plans.ts. Admin override documents
 * in the Plan collection take precedence at runtime (merged via `getMergedPlans()`).
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Plan } from "../../models/Plan";
import { PLANS, ADD_ONS } from "../../billing/plans";
import type { AuthRequest } from "../../types/auth";
import { asObjectId } from "../../utils/auth";

export const adminPlansRouter = Router();

adminPlansRouter.use(requireAdminAuth, adminAudit);

/* ---------- Zod schemas ---------- */

const EntitlementsSchema = z.object({
  sso: z.boolean().optional(),
  analytics: z.boolean().optional(),
  api: z.boolean().optional(),
  realtime: z.boolean().optional(),
  liveChat: z.boolean().optional(),
  videoCalls: z.boolean().optional(),
  aiFeatures: z.boolean().optional(),
  customSubdomain: z.boolean().optional(),
  brandedPortal: z.boolean().optional(),
  customFields: z.boolean().optional(),
  slaPolicies: z.boolean().optional(),
  internalMessaging: z.boolean().optional(),
  prioritySupport: z.boolean().optional(),
  seats: z.number().optional(),
  maxSeats: z.number().optional(),
  ticketLimit: z.number().nullable().optional(),
  aiCreditsMonthly: z.number().optional(),
  videoMinutesMonthly: z.number().optional(),
}).partial();

const UpdatePlanBody = z.object({
  name: z.string().min(1).max(100).optional(),
  tagline: z.string().max(200).optional(),
  seats: z.number().min(1).optional(),
  priceCentsPerSeat: z.number().min(0).optional(),
  priceCentsMonthly: z.number().min(0).optional(),
  active: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  entitlements: EntitlementsSchema.optional(),
});

/* ---------- Helpers ---------- */

/**
 * Merge canonical PLANS with any admin overrides in the DB.
 * Returns the effective plan catalog used at runtime.
 */
async function getMergedPlans() {
  const overrides: any[] = await Plan.find({}).lean();
  const overrideMap = new Map<string, any>(overrides.map((o: any) => [String(o.code), o]));

  return PLANS.map(canonical => {
    const override = overrideMap.get(canonical.code);
    if (!override) return { ...canonical, _override: false };

    return {
      ...canonical,
      ...(override.name !== undefined && { name: override.name }),
      ...(override.tagline !== undefined && { tagline: override.tagline }),
      ...(override.seats !== undefined && { seats: override.seats }),
      ...(override.priceCentsPerSeat !== undefined && { priceCentsPerSeat: override.priceCentsPerSeat }),
      ...(override.priceCentsMonthly !== undefined && { priceCentsMonthly: override.priceCentsMonthly }),
      ...(override.active !== undefined && { active: override.active }),
      ...(override.isCustom !== undefined && { isCustom: override.isCustom }),
      entitlements: { ...canonical.entitlements, ...(override.entitlements || {}) },
      _override: true,
      _overrideUpdatedAt: override.updatedAt,
    };
  });
}

/* ---------- Routes ---------- */

// GET / — list all plans (canonical + overrides merged)
adminPlansRouter.get("/", requireAdminPermission("ADMIN_SETTINGS_READ"), async (_req, res) => {
  try {
    const plans = await getMergedPlans();
    const addons = ADD_ONS;
    res.json({ data: { plans, addons } });
  } catch (e: any) {
    res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// GET /:code — get single plan with merged override
adminPlansRouter.get("/:code", requireAdminPermission("ADMIN_SETTINGS_READ"), async (req, res) => {
  const plans = await getMergedPlans();
  const plan = plans.find(p => p.code === req.params.code);
  if (!plan) return res.status(404).json({ error: "plan_not_found" });
  res.json({ data: plan });
});

// PUT /:code — upsert a plan override
adminPlansRouter.put("/:code", requireAdminPermission("ADMIN_SETTINGS_UPDATE"), async (req, res) => {
  try {
    const body = UpdatePlanBody.parse(req.body);
    const auth = (req as AuthRequest).auth;
    const code = req.params.code;

    // Verify the plan code exists in canonical catalog
    const canonical = PLANS.find(p => p.code === code);
    if (!canonical) return res.status(404).json({ error: "plan_code_not_found" });

    const update: any = {
      code,
      ...body,
      updatedBy: asObjectId(auth.sub),
    };

    // Default name/seats from canonical if creating new override
    if (!update.name) update.name = canonical.name;
    if (!update.seats) update.seats = canonical.seats;

    const plan = await Plan.findOneAndUpdate(
      { code },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ data: plan, message: "Plan override saved" });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// DELETE /:code — remove override (revert to canonical)
adminPlansRouter.delete("/:code", requireAdminPermission("ADMIN_SETTINGS_UPDATE"), async (req, res) => {
  try {
    const result = await Plan.deleteOne({ code: req.params.code });
    if (result.deletedCount === 0) return res.status(404).json({ error: "no_override_exists" });
    res.json({ ok: true, message: "Override removed, reverted to canonical plan" });
  } catch (e: any) {
    res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// GET /addons — list add-ons
adminPlansRouter.get("/addons/list", requireAdminPermission("ADMIN_SETTINGS_READ"), async (_req, res) => {
  res.json({ data: ADD_ONS });
});
