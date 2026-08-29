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

    // Atomic increment: only succeeds if count is below limit
    const updated = await Tenant.findOneAndUpdate(
      { _id: tenantId, lifetimeTicketCount: { $lt: limit } },
      { $inc: { lifetimeTicketCount: 1 } },
      { new: true }
    );

    if (!updated) {
      // Either tenant not found or limit reached
      const tenant = await Tenant.findById(tenantId).select("lifetimeTicketCount").lean();
      return res.status(403).json({
        error: "ticket_limit_reached",
        message: `Free tier limit of ${limit} tickets reached. Please upgrade your plan.`,
        limit,
        used: tenant?.lifetimeTicketCount ?? limit,
      });
    }

    // Mark that we already incremented so the route handler doesn't double-increment
    (req as any)._ticketCountIncremented = true;

    next();
  };
}
