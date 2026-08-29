/**
 * @module admin/routes/analytics
 * Platform-wide analytics: KPIs, trends, breakdowns.
 */
import { Router } from "express";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Ticket } from "../../models/Ticket";
import { Subscription } from "../../models/Subscription";
import { Customer } from "../../models/Customer";

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.use(requireAdminAuth, adminAudit);

// GET platform overview KPIs
adminAnalyticsRouter.get("/overview", requireAdminPermission("ADMIN_ANALYTICS_READ"), async (_req, res) => {
  const [
    totalTenants,
    activeTenants,
    totalUsers,
    activeUsers,
    totalTickets,
    openTickets,
    totalCustomers,
    subscriptionStats,
  ] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    User.countDocuments(),
    User.countDocuments({ status: "ACTIVE" }),
    Ticket.countDocuments(),
    Ticket.countDocuments({ status: "OPEN" }),
    Customer.countDocuments(),
    Subscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const subscriptions = Object.fromEntries(
    subscriptionStats.map((s: any) => [s._id, s.count])
  );

  res.json({
    data: {
      tenants: { total: totalTenants, active: activeTenants },
      users: { total: totalUsers, active: activeUsers },
      tickets: { total: totalTickets, open: openTickets },
      customers: { total: totalCustomers },
      subscriptions,
    },
  });
});

// GET tenant growth (last 30 days)
adminAnalyticsRouter.get("/growth", requireAdminPermission("ADMIN_ANALYTICS_READ"), async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [newTenants, newUsers, newTickets] = await Promise.all([
    Tenant.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Ticket.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({ data: { newTenants, newUsers, newTickets } });
});

// GET plan distribution
adminAnalyticsRouter.get("/plans", requireAdminPermission("ADMIN_ANALYTICS_READ"), async (_req, res) => {
  const distribution = await Subscription.aggregate([
    { $group: { _id: "$planCode", count: { $sum: 1 }, totalSeats: { $sum: "$seats" } } },
    { $sort: { count: -1 } },
  ]);

  res.json({ data: distribution });
});
