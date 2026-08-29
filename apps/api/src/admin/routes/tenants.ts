/**
 * @module admin/routes/tenants
 * Platform-level tenant management: list, get, update, suspend/activate.
 */
// Loads pino-http's Express augmentation so `req.log` is typed regardless of
// which entrypoint pulls this module in (e.g. docs/generate.ts, which never imports app.ts).
import type {} from "pino-http";
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import type { AuthRequest } from "../../types/auth";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Subscription } from "../../models/Subscription";
import { Ticket } from "../../models/Ticket";
import { asObjectId } from "../../utils/auth";

export const adminTenantsRouter = Router();

adminTenantsRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  plan: z.enum(["FREE", "INDIVIDUAL", "COMPANY"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});

const UpdateBody = z.object({
  plan: z.enum(["FREE", "INDIVIDUAL", "COMPANY"]).optional(),
  seats: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
  branding: z.object({
    name: z.string().min(1).optional(),
    primaryColor: z.string().optional(),
    surfaceColor: z.string().optional(),
    logoUrl: z.string().optional(),
    emailFrom: z.string().optional(),
  }).optional(),
});

// GET list tenants
adminTenantsRouter.get("/", requireAdminPermission("ADMIN_TENANT_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.plan) filter.plan = q.plan;
  if (q.isActive !== undefined) filter.isActive = q.isActive === "true";
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  if (q.q) {
    filter.$or = [
      { slug: { $regex: q.q, $options: "i" } },
      { "branding.name": { $regex: q.q, $options: "i" } },
    ];
  }

  const items = await Tenant.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const tenantIds = items.map(t => t._id);
  const owners = await User.find(
    { tenantId: { $in: tenantIds }, roles: "OWNER" },
    { tenantId: 1, email: 1, createdAt: 1 },
  ).sort({ createdAt: 1 }).lean();
  const ownerByTenant = new Map<string, string>();
  for (const u of owners) {
    const key = String(u.tenantId);
    if (!ownerByTenant.has(key)) ownerByTenant.set(key, u.email);
  }
  const enriched = items.map(t => ({ ...t, ownerEmail: ownerByTenant.get(String(t._id)) || null }));

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
  const total = await Tenant.countDocuments(q.q || q.plan || q.isActive !== undefined ? filter : {});

  res.json({ data: enriched, nextCursor, total });
});

// GET single tenant with stats
adminTenantsRouter.get("/:id", requireAdminPermission("ADMIN_TENANT_READ"), async (req, res) => {
  const tenant = await Tenant.findById(asObjectId(req.params.id)).lean();
  if (!tenant) return res.status(404).json({ error: "not_found" });

  const [userCount, ticketCount, subscription] = await Promise.all([
    User.countDocuments({ tenantId: tenant._id }),
    Ticket.countDocuments({ tenantId: tenant._id }),
    Subscription.findOne({ tenantId: tenant._id }).lean(),
  ]);

  res.json({ data: { ...tenant, stats: { userCount, ticketCount }, subscription } });
});

// PUT update tenant
adminTenantsRouter.put("/:id", requireAdminPermission("ADMIN_TENANT_UPDATE"), async (req, res) => {
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.plan) update.plan = body.plan;
    if (body.seats) update.seats = body.seats;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.branding) {
      for (const [k, v] of Object.entries(body.branding)) {
        if (v !== undefined) update[`branding.${k}`] = v;
      }
    }

    const tenant = await Tenant.findByIdAndUpdate(
      asObjectId(req.params.id),
      { $set: update },
      { new: true }
    ).lean();
    if (!tenant) return res.status(404).json({ error: "not_found" });
    res.json({ data: tenant });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// POST suspend tenant
adminTenantsRouter.post("/:id/suspend", requireAdminPermission("ADMIN_TENANT_SUSPEND"), async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(
    asObjectId(req.params.id),
    { isActive: false },
    { new: true }
  ).lean();
  if (!tenant) return res.status(404).json({ error: "not_found" });
  res.json({ data: tenant });
});

// POST activate tenant
adminTenantsRouter.post("/:id/activate", requireAdminPermission("ADMIN_TENANT_SUSPEND"), async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(
    asObjectId(req.params.id),
    { isActive: true },
    { new: true }
  ).lean();
  if (!tenant) return res.status(404).json({ error: "not_found" });
  res.json({ data: tenant });
});

// DELETE tenant — HARD DELETE, requires SUPER_ADMIN permission + typed slug confirmation.
// Purges the tenant and ALL associated data across 30+ collections.
// This is a destructive, unrecoverable operation.
const DeleteBody = z.object({
  confirmSlug: z.string().min(1),
});

adminTenantsRouter.delete("/:id", requireAdminPermission("ADMIN_TENANT_DELETE"), async (req, res) => {
  try {
    const body = DeleteBody.parse(req.body);
    const tenantId = asObjectId(req.params.id);

    // Load tenant to verify existence + match confirmation slug
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) return res.status(404).json({ error: "not_found" });

    // Confirmation guard: the caller must type the exact slug to confirm
    if (body.confirmSlug !== tenant.slug) {
      return res.status(400).json({
        error: "confirmation_mismatch",
        message: `Confirmation slug must exactly match '${tenant.slug}'`,
      });
    }

    // Capture acting admin for audit trail (recorded by adminAudit middleware)
    const auth = (req as AuthRequest).auth;
    req.log?.warn?.(
      { tenantId: String(tenantId), tenantSlug: tenant.slug, actorId: auth?.sub },
      "Tenant hard-delete initiated"
    );

    // Perform the purge
    const { purgeTenant } = await import("../../services/tenantPurge");
    const result = await purgeTenant(String(tenantId));

    return res.json({
      ok: true,
      message: `Tenant '${result.tenantSlug}' and ${result.totalDeleted} associated records permanently deleted.`,
      data: result,
    });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    req.log?.error?.({ err: e }, "Tenant delete failed");
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});
