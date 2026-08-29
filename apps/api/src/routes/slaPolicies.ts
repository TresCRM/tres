import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { SlaPolicy } from "../models/SlaPolicy";
import { requireActiveSubscription } from "../middlewares/subscriptionGuard";
import { logActivity } from "../utils/log";
import { badRequest } from "../utils/http";

export const slaPoliciesRouter = Router();

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "ALL"]),
  firstResponseMinutes: z.number().min(1),
  resolutionMinutes: z.number().min(1),
  businessHoursOnly: z.boolean().optional(),
  breachNotifyAssignee: z.boolean().optional(),
  breachNotifyManager: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial().extend({
  isActive: z.boolean().optional(),
});

// GET / — list policies
slaPoliciesRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const policies = await SlaPolicy.find({
    tenantId: asObjectId(auth.tid),
    isActive: true,
  })
    .sort({ isDefault: -1, priority: 1 })
    .lean();
  res.json({ data: policies });
});

// GET /:id
slaPoliciesRouter.get("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const policy = await SlaPolicy.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();
  if (!policy) return res.status(404).json({ error: "not_found" });
  res.json({ data: policy });
});

// POST / — create
slaPoliciesRouter.post(
  "/",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    // If setting as default, unset other defaults for same priority
    if (parsed.data.isDefault) {
      await SlaPolicy.updateMany(
        { tenantId: asObjectId(auth.tid), priority: parsed.data.priority, isDefault: true },
        { isDefault: false }
      );
    }

    const policy = await SlaPolicy.create({
      ...parsed.data,
      tenantId: auth.tid,
    });
    try { await logActivity(req, { action: "sla_policy.created", http: 201, meta: { policyId: String(policy._id) } }); } catch {}
    res.status(201).json({ data: policy });
  }
);

// PUT /:id — update
slaPoliciesRouter.put(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    if (parsed.data.isDefault) {
      const existing = await SlaPolicy.findById(asObjectId(req.params.id));
      if (existing) {
        await SlaPolicy.updateMany(
          { tenantId: asObjectId(auth.tid), priority: existing.priority, isDefault: true, _id: { $ne: existing._id } },
          { isDefault: false }
        );
      }
    }

    const policy = await SlaPolicy.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      parsed.data,
      { new: true }
    );
    if (!policy) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "sla_policy.updated", http: 200, meta: { policyId: String(policy._id) } }); } catch {}
    res.json({ data: policy });
  }
);

// DELETE /:id — soft delete
slaPoliciesRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const policy = await SlaPolicy.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { isActive: false },
      { new: true }
    );
    if (!policy) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "sla_policy.deleted", http: 200, meta: { policyId: String(policy._id) } }); } catch {}
    res.json({ data: policy });
  }
);
