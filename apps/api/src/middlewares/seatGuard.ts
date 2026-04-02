/**
 * @module middlewares/seatGuard
 * Prevents adding users beyond the subscription's seat limit.
 * Applied to user invite routes.
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../types/auth";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { asObjectId } from "../utils/auth";

/**
 * Check that inviting a new user won't exceed the plan's seat limit.
 * Returns 403 with seat details if at capacity.
 */
export function enforceSeatLimit(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthRequest).auth;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  (async () => {
    const sub = await Subscription.findOne({
      tenantId: asObjectId(auth.tid),
      status: { $in: ["ACTIVE", "GRACE", "PAST_DUE"] },
    }).lean();

    if (!sub) {
      return res.status(402).json({
        error: "no_subscription",
        message: "An active subscription is required to invite users",
      });
    }

    const activeUsers = await User.countDocuments({
      tenantId: asObjectId(auth.tid),
      status: "ACTIVE",
    });

    if (activeUsers >= sub.seats) {
      return res.status(403).json({
        error: "seat_limit_reached",
        message: `Your plan allows ${sub.seats} seats. You currently have ${activeUsers} active users.`,
        seats: sub.seats,
        current: activeUsers,
      });
    }

    next();
  })().catch(next);
}
