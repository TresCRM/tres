/**
 * Middleware that enforces password expiry on protected routes.
 * If the user's password is older than PASSWORD_MAX_AGE_DAYS, returns 403
 * with error "password_expired" so the frontend can redirect to change-password.
 *
 * Exempted routes:
 *  - /auth/* (login, signup, refresh, change-password, reset, forgot)
 *  - /mfa/* (MFA setup/verify)
 *  - /subscriptions/plans (public)
 *  - /healthz, /readyz, /metrics
 */
import type { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env";
import { User } from "../models/User";
import { asObjectId } from "../utils/auth";

const MAX_AGE_MS = ENV.PASSWORD_MAX_AGE_DAYS * 86_400_000;

// Skip enforcement if max age is 0 (disabled) or in test mode
const DISABLED = MAX_AGE_MS <= 0 || ENV.IS_TEST;

// Paths exempt from password expiry checks
const EXEMPT_PREFIXES = [
  "/api/v1/auth/",
  "/api/v1/mfa/",
  "/healthz",
  "/readyz",
  "/metrics",
  "/docs",
  "/public/",
];

export function passwordExpiryGuard(req: Request, res: Response, next: NextFunction) {
  if (DISABLED) return next();

  // Skip if no auth payload (unauthenticated requests handled elsewhere)
  const auth = (req as any).auth;
  if (!auth?.sub) return next();

  // Skip exempt paths
  const path = req.originalUrl || req.path;
  if (EXEMPT_PREFIXES.some(p => path.startsWith(p))) return next();

  // Skip safe methods (GET/HEAD/OPTIONS) — allow reading even with expired password
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();

  // Check password age
  User.findById(asObjectId(auth.sub))
    .select("passwordChangedAt")
    .lean()
    .then(user => {
      if (!user) return next();

      const changedAt = user.passwordChangedAt
        ? new Date(user.passwordChangedAt).getTime()
        : 0; // Never changed = treat as expired

      if (Date.now() - changedAt > MAX_AGE_MS) {
        return res.status(403).json({
          error: "password_expired",
          message: "Your password has expired. Please change it before continuing.",
        });
      }
      next();
    })
    .catch(() => next()); // Fail open on DB errors
}
