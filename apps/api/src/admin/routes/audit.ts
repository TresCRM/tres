/**
 * @module admin/routes/audit
 * Platform-wide audit log viewer with filtering.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { ActivityLog } from "../../models/ActivityLog";
import { asObjectId } from "../../utils/auth";

export const adminAuditRouter = Router();

adminAuditRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  status: z.coerce.number().optional(),
  route: z.string().optional(),
  actorId: z.string().optional(),
  tenantId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// GET audit logs
adminAuditRouter.get("/", requireAdminPermission("ADMIN_AUDIT_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.method) filter.method = q.method;
  if (q.status) filter.status = q.status;
  if (q.route) filter.route = { $regex: q.route, $options: "i" };
  if (q.actorId) filter.actorId = asObjectId(q.actorId);
  if (q.tenantId) filter.tenantId = asObjectId(q.tenantId);
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(q.to);
  }

  const items = await ActivityLog.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});

// GET audit log stats (last 24h)
adminAuditRouter.get("/stats", requireAdminPermission("ADMIN_AUDIT_READ"), async (_req, res) => {
  const oneDayAgo = new Date(Date.now() - 86400000);

  const stats = await ActivityLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        avgDuration: { $avg: "$durationMs" },
        errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } },
      },
    },
  ]);

  const methodBreakdown = await ActivityLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    { $group: { _id: "$method", count: { $sum: 1 } } },
  ]);

  res.json({
    data: {
      last24h: stats[0] || { totalRequests: 0, avgDuration: 0, errors: 0 },
      methodBreakdown: Object.fromEntries(methodBreakdown.map((m: any) => [m._id, m.count])),
    },
  });
});
