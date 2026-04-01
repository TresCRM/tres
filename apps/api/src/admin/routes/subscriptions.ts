/**
 * @module admin/routes/subscriptions
 * Platform-level subscription management: list, update, cancel, extend grace.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Subscription } from "../../models/Subscription";
import { Tenant } from "../../models/Tenant";
import { asObjectId } from "../../utils/auth";
import { addDays } from "date-fns";

export const adminSubscriptionsRouter = Router();

adminSubscriptionsRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["ACTIVE", "PAST_DUE", "GRACE", "EXPIRED", "CANCELED"]).optional(),
  planCode: z.string().optional(),
});

const UpdateBody = z.object({
  status: z.enum(["ACTIVE", "PAST_DUE", "GRACE", "EXPIRED", "CANCELED"]).optional(),
  planCode: z.string().optional(),
  seats: z.number().min(1).optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  graceUntil: z.string().datetime().nullable().optional(),
  autoRenew: z.boolean().optional(),
});

// GET list all subscriptions
adminSubscriptionsRouter.get("/", requireAdminPermission("ADMIN_SUBSCRIPTION_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.status) filter.status = q.status;
  if (q.planCode) filter.planCode = q.planCode;
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await Subscription.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  // Enrich with tenant info
  const tenantIds = [...new Set(items.map(s => String(s.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds.map(id => asObjectId(id)) } })
    .select("slug branding.name")
    .lean();
  const tenantMap = Object.fromEntries(tenants.map(t => [String(t._id), t]));

  const enriched = items.map(s => ({
    ...s,
    tenant: tenantMap[String(s.tenantId)] || null,
  }));

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: enriched, nextCursor });
});

// GET single subscription
adminSubscriptionsRouter.get("/:id", requireAdminPermission("ADMIN_SUBSCRIPTION_READ"), async (req, res) => {
  const sub = await Subscription.findById(asObjectId(req.params.id)).lean();
  if (!sub) return res.status(404).json({ error: "not_found" });

  const tenant = await Tenant.findById(sub.tenantId).select("slug branding.name plan").lean();
  res.json({ data: { ...sub, tenant } });
});

// PUT update subscription
adminSubscriptionsRouter.put("/:id", requireAdminPermission("ADMIN_SUBSCRIPTION_UPDATE"), async (req, res) => {
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.status) update.status = body.status;
    if (body.planCode) update.planCode = body.planCode;
    if (body.seats) update.seats = body.seats;
    if (body.currentPeriodEnd) update.currentPeriodEnd = new Date(body.currentPeriodEnd);
    if (body.graceUntil !== undefined) update.graceUntil = body.graceUntil ? new Date(body.graceUntil) : null;
    if (body.autoRenew !== undefined) update.autoRenew = body.autoRenew;

    const sub = await Subscription.findByIdAndUpdate(
      asObjectId(req.params.id),
      { $set: update },
      { new: true }
    ).lean();
    if (!sub) return res.status(404).json({ error: "not_found" });
    res.json({ data: sub });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST cancel subscription
adminSubscriptionsRouter.post("/:id/cancel", requireAdminPermission("ADMIN_SUBSCRIPTION_CANCEL"), async (req, res) => {
  const sub = await Subscription.findByIdAndUpdate(
    asObjectId(req.params.id),
    { $set: { status: "CANCELED", canceledAt: new Date(), autoRenew: false } },
    { new: true }
  ).lean();
  if (!sub) return res.status(404).json({ error: "not_found" });
  res.json({ data: sub });
});

// POST extend grace period
adminSubscriptionsRouter.post("/:id/extend-grace", requireAdminPermission("ADMIN_SUBSCRIPTION_UPDATE"), async (req, res) => {
  const { days = 7 } = req.body;
  const sub = await Subscription.findByIdAndUpdate(
    asObjectId(req.params.id),
    { $set: { status: "GRACE", graceUntil: addDays(new Date(), days) } },
    { new: true }
  ).lean();
  if (!sub) return res.status(404).json({ error: "not_found" });
  res.json({ data: sub });
});
