import { Request, Response, NextFunction } from "express";
import { Subscription } from "../models/Subscription";
import { asObjectId } from "../utils/auth";
import { paymentRequired } from "../utils/http";
import type { AuthRequest } from "../types/auth";
type Opts = { write?: boolean };

export function requireActiveSubscription(opts: Opts = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as Partial<AuthRequest>).auth;
    if (!auth?.tid) return paymentRequired(req, res, "subscription_required", "Tenant missing");

    const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) }).lean();
    if (!sub) return paymentRequired(req, res, "subscription_required", "No subscription");

    const now = new Date();
    const inPaid = sub.currentPeriodEnd > now;
    const inGrace = !!sub.graceUntil && sub.graceUntil > now;

    if (!opts.write) return next(); // reads always OK

    // Writes allowed when in paid period OR grace window
    if (inPaid || inGrace) return next();

    // Otherwise read-only: 402
    return paymentRequired(req, res, "subscription_expired", "Subscription expired");
  };
}

