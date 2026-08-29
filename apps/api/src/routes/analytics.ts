/**
 * @module routes/analytics
 * Analytics and reporting endpoints: ticket summaries, agent performance,
 * customer intelligence, SLA compliance, and CSV export.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Ticket } from "../models/Ticket";
import { User } from "../models/User";
import { Customer } from "../models/Customer";
import { badRequest } from "../utils/http";

export const analyticsRouter = Router();

// ─── Ticket Summary ─────────────────────────────────────────────────
analyticsRouter.get("/tickets/summary", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  const pipeline = await Ticket.aggregate([
    { $match: { tenantId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of pipeline) {
    counts[row._id] = row.count;
    total += row.count;
  }

  res.json({
    data: {
      open: counts["OPEN"] ?? 0,
      assigned: counts["ASSIGNED"] ?? 0,
      inProgress: counts["IN_PROGRESS"] ?? 0,
      awaitingCustomer: counts["AWAITING_CUSTOMER"] ?? 0,
      resolved: counts["RESOLVED"] ?? 0,
      closed: counts["CLOSED"] ?? 0,
      total,
    },
  });
});

// ─── Ticket Volume Over Time ────────────────────────────────────────
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

analyticsRouter.get("/tickets/volume", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  const periodKey = (req.query.period as string) || "30d";
  const days = PERIOD_DAYS[periodKey] ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const pipeline = await Ticket.aggregate([
    { $match: { tenantId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", count: 1 } },
  ]);

  res.json({ data: pipeline });
});

// ─── SLA Compliance ─────────────────────────────────────────────────
analyticsRouter.get("/tickets/sla", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  const pipeline = await Ticket.aggregate([
    { $match: { tenantId, sla: { $exists: true } } },
    {
      $group: {
        _id: null,
        firstResponseMet: {
          $sum: { $cond: [{ $and: [{ $ifNull: ["$sla.firstRespondedAt", false] }, { $eq: ["$sla.firstResponseBreached", false] }] }, 1, 0] },
        },
        firstResponseBreached: {
          $sum: { $cond: [{ $eq: ["$sla.firstResponseBreached", true] }, 1, 0] },
        },
        resolutionMet: {
          $sum: { $cond: [{ $and: [{ $ifNull: ["$sla.resolvedAt", false] }, { $eq: ["$sla.resolutionBreached", false] }] }, 1, 0] },
        },
        resolutionBreached: {
          $sum: { $cond: [{ $eq: ["$sla.resolutionBreached", true] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  const row = pipeline[0] || { firstResponseMet: 0, firstResponseBreached: 0, resolutionMet: 0, resolutionBreached: 0, total: 0 };
  const totalChecks = row.firstResponseMet + row.firstResponseBreached + row.resolutionMet + row.resolutionBreached;
  const metTotal = row.firstResponseMet + row.resolutionMet;
  const complianceRate = totalChecks > 0 ? Math.round((metTotal / totalChecks) * 10000) / 100 : 100;

  res.json({
    data: {
      firstResponseMet: row.firstResponseMet,
      firstResponseBreached: row.firstResponseBreached,
      resolutionMet: row.resolutionMet,
      resolutionBreached: row.resolutionBreached,
      complianceRate,
    },
  });
});

// ─── Agent Performance ──────────────────────────────────────────────
analyticsRouter.get("/agents/performance", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  // Resolved tickets per agent
  const resolved = await Ticket.aggregate([
    { $match: { tenantId, assigneeId: { $exists: true }, status: { $in: ["RESOLVED", "CLOSED"] } } },
    {
      $group: {
        _id: "$assigneeId",
        ticketsResolved: { $sum: 1 },
        avgResolutionMs: {
          $avg: { $subtract: ["$updatedAt", "$createdAt"] },
        },
      },
    },
  ]);

  // Active workload per agent
  const active = await Ticket.aggregate([
    { $match: { tenantId, assigneeId: { $exists: true }, status: { $nin: ["RESOLVED", "CLOSED"] } } },
    { $group: { _id: "$assigneeId", activeWorkload: { $sum: 1 } } },
  ]);
  const activeMap = new Map(active.map((r) => [String(r._id), r.activeWorkload]));

  // Look up agent names
  const agentIds = resolved.map((r) => r._id);
  const agents = await User.find({ _id: { $in: agentIds } }).select("firstName lastName").lean();
  const nameMap = new Map(agents.map((a) => [String(a._id), `${a.firstName} ${a.lastName}`]));

  const data = resolved.map((r) => ({
    agentId: String(r._id),
    name: nameMap.get(String(r._id)) ?? "Unknown",
    ticketsResolved: r.ticketsResolved,
    avgResolutionMs: Math.round(r.avgResolutionMs ?? 0),
    activeWorkload: activeMap.get(String(r._id)) ?? 0,
  }));

  res.json({ data });
});

// ─── Customer Intelligence ──────────────────────────────────────────
analyticsRouter.get("/customers/intelligence", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const totalCustomers = await Customer.countDocuments({ tenantId });

  // Repeat customers: 3+ tickets in last 30 days
  const repeatPipeline = await Ticket.aggregate([
    { $match: { tenantId, customerEmail: { $exists: true, $ne: null }, createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: "$customerEmail", count: { $sum: 1 } } },
    { $match: { count: { $gte: 3 } } },
    { $count: "total" },
  ]);
  const repeatCustomers = repeatPipeline[0]?.total ?? 0;

  // Avg tickets per customer
  const avgPipeline = await Ticket.aggregate([
    { $match: { tenantId, customerEmail: { $exists: true, $ne: null } } },
    { $group: { _id: "$customerEmail", count: { $sum: 1 } } },
    { $group: { _id: null, avg: { $avg: "$count" } } },
  ]);
  const avgTicketsPerCustomer = Math.round((avgPipeline[0]?.avg ?? 0) * 100) / 100;

  res.json({
    data: {
      repeatCustomers,
      totalCustomers,
      avgTicketsPerCustomer,
    },
  });
});

// ─── CSV Export ──────────────────────────────────────────────────────
const ExportQuery = z.object({
  type: z.enum(["tickets", "agents", "customers"]),
  from: z.string().optional(),
  to: z.string().optional(),
});

analyticsRouter.get("/export", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tenantId = asObjectId(auth.tid);

  const parsed = ExportQuery.safeParse(req.query);
  if (!parsed.success) {
    return await badRequest(req, res, "invalid_request", "Invalid export parameters", parsed.error);
  }

  const { type, from, to } = parsed.data;
  const dateFilter: any = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  let csv = "";

  if (type === "tickets") {
    const match: any = { tenantId };
    if (hasDateFilter) match.createdAt = dateFilter;
    const tickets = await Ticket.find(match).select("subject status priority customerEmail assigneeId createdAt updatedAt").lean();
    csv = "Subject,Status,Priority,Customer Email,Assignee,Created,Updated\n";
    for (const t of tickets) {
      csv += `"${(t.subject || "").replace(/"/g, '""')}",${t.status},${t.priority},${t.customerEmail ?? ""},${t.assigneeId ?? ""},${t.createdAt.toISOString()},${t.updatedAt.toISOString()}\n`;
    }
  } else if (type === "agents") {
    const agents = await User.find({ tenantId, roles: { $in: ["AGENT", "ADMIN", "OWNER"] } }).select("firstName lastName email createdAt").lean();
    csv = "Name,Email,Created\n";
    for (const a of agents) {
      csv += `"${a.firstName} ${a.lastName}",${a.email},${a.createdAt.toISOString()}\n`;
    }
  } else if (type === "customers") {
    const match: any = { tenantId };
    if (hasDateFilter) match.createdAt = dateFilter;
    const customers = await Customer.find(match).select("name email company createdAt").lean();
    csv = "Name,Email,Company,Created\n";
    for (const c of customers) {
      csv += `"${(c.name || "").replace(/"/g, '""')}",${c.email},"${(c.company ?? "").replace(/"/g, '""')}",${c.createdAt.toISOString()}\n`;
    }
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-export.csv"`);
  res.send(csv);
});
