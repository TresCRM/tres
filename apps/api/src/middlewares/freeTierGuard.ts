/**
 * @module middlewares/freeTierGuard
 * Enforces the free tier lifetime ticket limit (50 tickets).
 * Applied on ticket creation routes.
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../types/auth";
import { Tenant } from "../models/Tenant";
import { Subscription } from "../models/Subscription";
import { asObjectId } from "../utils/auth";
import { getPlanTicketLimit } from "../billing/plans";

export function enforceTicketLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthRequest).auth;
    if (!auth?.tid) return next();

    const tenantId = asObjectId(auth.tid);

    // Find the subscription to check the plan
    const sub = await Subscription.findOne({ tenantId }).lean();
    if (!sub) return next(); // no subscription = handled by subscriptionGuard

    const limit = getPlanTicketLimit(sub.planCode);
    if (limit === null) return next(); // unlimited plan

    // Check lifetime count
    const tenant = await Tenant.findById(tenantId).select("lifetimeTicketCount").lean();
    if (!tenant) return next();

    if (tenant.lifetimeTicketCount >= limit) {
      return res.status(403).json({
        error: "ticket_limit_reached",
        message: `Free tier limit of ${limit} tickets reached. Please upgrade your plan.`,
        limit,
        used: tenant.lifetimeTicketCount,
      });
    }

    next();
  };
}
