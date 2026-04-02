/**
 * @module admin/routes/errors
 * Platform-wide error log viewer with filtering, stats, and CSV export.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminPermission } from "../middleware";
import { ErrorLog } from "../../models/ErrorLog";
import { asObjectId } from "../../utils/auth";

export const adminErrorsRouter = Router();

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  http: z.coerce.number().optional(),
  code: z.string().optional(),
  route: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  tenantId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// GET error logs
adminErrorsRouter.get("/", requireAdminPermission("ADMIN_AUDIT_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.http) filter.http = q.http;
  if (q.code) filter.code = { $regex: q.code, $options: "i" };
  if (q.route) filter.route = { $regex: q.route, $options: "i" };
  if (q.method) filter.method = q.method;
  if (q.tenantId) filter.tenantId = asObjectId(q.tenantId);
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(q.to);
  }

  const items = await ErrorLog.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});

// GET error stats (last 24h)
adminErrorsRouter.get("/stats", requireAdminPermission("ADMIN_AUDIT_READ"), async (_req, res) => {
  const oneDayAgo = new Date(Date.now() - 86400000);

  const [totals] = await ErrorLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        serverErrors: { $sum: { $cond: [{ $gte: ["$http", 500] }, 1, 0] } },
        clientErrors: { $sum: { $cond: [{ $and: [{ $gte: ["$http", 400] }, { $lt: ["$http", 500] }] }, 1, 0] } },
      },
    },
  ]);

  const byCode = await ErrorLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    { $group: { _id: "$code", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const byRoute = await ErrorLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    { $group: { _id: "$route", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const hourly = await ErrorLog.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%dT%H:00:00Z", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    data: {
      last24h: totals || { total: 0, serverErrors: 0, clientErrors: 0 },
      topCodes: byCode,
      topRoutes: byRoute,
      hourly,
    },
  });
});
