/**
 * @module admin/middleware
 * Admin-specific authentication and authorization middleware.
 * Separated from tenant middleware — admin routes operate cross-tenant.
 *
 * Security layers (applied in order):
 *  1. adminRateLimiter  — strict rate limiting (30 req/min per user/IP)
 *  2. requireAdminAuth  — JWT verification + admin role check
 *  3. requireAdminMfa   — mandatory MFA for all admin users
 *  4. adminAudit        — full request audit logging
 *  5. requireAdminRole / requireAdminPermission — per-route RBAC
 */
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { verifyToken, asObjectId } from "../utils/auth";
import type { AuthPayload } from "../types/auth";
import {
  type Role,
  type Permission,
  isValidRole,
  isAdminRole,
  hasRole,
  hasAllPermissions,
  ADMIN_ROLES,
} from "../../../../packages/types/src/roles";
import { logSecurityEvent } from "../services/securityLogger";
import { User } from "../models/User";
import { ENV } from "../config/env";

/**
 * Verify JWT and ensure user has at least one platform admin role.
 * Attaches `req.auth` with typed payload.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.header("Authorization");
  const token = hdr?.startsWith("Bearer ") ? hdr.slice(7) : req.cookies?.tc_session;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyToken(token);
    const validRoles = (payload.roles || []).filter(
      (r: string): r is Role => isValidRole(r)
    );
    const hasAdminAccess = validRoles.some((r) => isAdminRole(r));
    if (!hasAdminAccess) {
      logSecurityEvent({
        event: "admin.access_denied",
        userId: payload.sub,
        ip: req.ip,
        metadata: { roles: validRoles, route: req.originalUrl },
      });
      return res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    }
    (req as any).auth = {
      sub: payload.sub,
      tid: payload.tid,
      roles: validRoles,
    } satisfies AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Check that user has at least one of the specified admin roles.
 * Respects admin hierarchy: SUPER_ADMIN > MANAGER > SALES/CUSTOMER_CARE.
 * SPECIAL is lateral — must match exactly.
 */
export function requireAdminRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthPayload | undefined;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const ok = roles.some((required) => hasRole(auth.roles, required));
    if (!ok) {
      return res.status(403).json({ error: "Forbidden", message: "Insufficient admin role" });
    }
    next();
  };
}

/**
 * Check that user has ALL of the specified admin permissions.
 */
export function requireAdminPermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthPayload | undefined;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    if (!hasAllPermissions(auth.roles, permissions)) {
      return res.status(403).json({ error: "Forbidden", message: "Insufficient admin permissions" });
    }
    next();
  };
}

// ─── Rate Limiter ────────────────────────────────────────────────────
/**
 * Strict rate limiter for admin routes.
 * 30 requests/min per user (half the global limit) — admin actions
 * are high-privilege and low-volume, so a tighter limit is appropriate.
 */
const skip = () => ENV.DISABLE_RATE_LIMIT;

export const adminRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => {
    const auth = (req as any).auth;
    return auth?.sub ? `admin:${auth.sub}` : req.ip || "unknown";
  },
  message: { error: "rate_limited", message: "Too many admin requests. Try again later." },
});

// ─── MFA Enforcement ─────────────────────────────────────────────────
/**
 * Require MFA to be enabled for ALL admin users before they can access
 * any admin route. Unlike tenant MFA which only applies to OWNER/ADMIN,
 * this applies to every admin role — admin actions are inherently high-risk.
 *
 * Returns 403 { error: "admin_mfa_required" } so the frontend can
 * redirect to the admin security setup page.
 */
export async function requireAdminMfa(req: Request, res: Response, next: NextFunction) {
  // Skip in test environment (same pattern as tenant MFA middleware)
  if (process.env.NODE_ENV === "test") return next();

  const auth = (req as any).auth as AuthPayload | undefined;
  if (!auth) return next(); // requireAdminAuth already rejected unauthenticated

  try {
    const user = await User.findById(asObjectId(auth.sub)).select("mfa.enabled").lean();
    if (!user?.mfa?.enabled) {
      logSecurityEvent({
        event: "admin.access_denied",
        userId: auth.sub,
        ip: req.ip,
        metadata: { reason: "mfa_not_enabled", roles: auth.roles, route: req.originalUrl },
      });
      return res.status(403).json({
        error: "admin_mfa_required",
        message: "MFA must be enabled for all admin accounts. Set up two-factor authentication to continue.",
      });
    }
    next();
  } catch {
    // DB error — fail closed for admin (unlike tenant which fails open)
    return res.status(500).json({ error: "internal", message: "Security check failed" });
  }
}

// ─── IP Allow-list (optional) ────────────────────────────────────────
/**
 * Optional IP allow-list for admin routes. When ADMIN_ALLOWED_IPS env var
 * is set (comma-separated), only those IPs can access admin routes.
 * When unset, all IPs are allowed (for dev/staging flexibility).
 */
export function adminIpGuard(req: Request, res: Response, next: NextFunction) {
  const allowedRaw = process.env.ADMIN_ALLOWED_IPS;
  if (!allowedRaw) return next(); // not configured — allow all

  const allowed = new Set(allowedRaw.split(",").map(s => s.trim()).filter(Boolean));
  const clientIp = req.ip || "";

  if (!allowed.has(clientIp)) {
    logSecurityEvent({
      event: "admin.access_denied",
      userId: (req as any).auth?.sub,
      ip: clientIp,
      metadata: { reason: "ip_not_allowed", route: req.originalUrl },
    });
    return res.status(403).json({ error: "Forbidden", message: "Access denied from this network" });
  }
  next();
}

// ─── Session Fingerprint Validation ──────────────────────────────────
/**
 * Validates that the admin request's User-Agent matches what was used at login.
 * Detects token theft where the attacker uses a different browser/device.
 * Logs a security event on mismatch but does not block (soft enforcement) —
 * the event can trigger alerts in SIEM.
 */
export function adminSessionFingerprint(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthPayload | undefined;
  if (!auth) return next();

  const currentUa = req.get("user-agent") || "";
  // Store the first UA seen per session in a lightweight way via response header
  // The actual device-binding enforcement is in token refresh (auth.ts),
  // but here we log suspicious UA changes for admin sessions specifically
  if (currentUa && auth.sub) {
    const key = `admin_ua:${auth.sub}`;
    const cached = adminUaCache.get(key);
    if (cached && cached !== currentUa) {
      logSecurityEvent({
        event: "admin.access_denied",
        userId: auth.sub,
        ip: req.ip,
        metadata: {
          reason: "ua_mismatch",
          expected: cached.substring(0, 50),
          actual: currentUa.substring(0, 50),
          route: req.originalUrl,
        },
      });
    }
    if (!cached) adminUaCache.set(key, currentUa);
  }
  next();
}

// Simple in-memory UA cache per admin session (cleared on restart, which is fine)
const adminUaCache = new Map<string, string>();
// Cleanup stale entries every 30 minutes
setInterval(() => {
  if (adminUaCache.size > 10_000) adminUaCache.clear();
}, 30 * 60_000).unref();

// ─── Audit Logger ────────────────────────────────────────────────────
/**
 * Audit logger for admin actions. Logs every admin request with full context.
 */
export function adminAudit(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const auth = (req as any).auth as AuthPayload | undefined;

  res.on("finish", () => {
    logSecurityEvent({
      event: "admin.action",
      userId: auth?.sub,
      ip: req.ip,
      metadata: {
        roles: auth?.roles,
        method: req.method,
        route: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ua: req.get("user-agent"),
      },
    });
  });

  next();
}
