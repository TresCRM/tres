/**
 * @module middlewares/auth
 * Authentication and authorization middleware.
 * - requireAuth: verify JWT Bearer token, attach typed auth payload
 * - requireRoles: check user has any of the specified roles (with hierarchy)
 * - requireExactRole: check exact role match (no hierarchy)
 * - requirePermission: check user has all specified permissions
 */
import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import type { AuthPayload, AuthRequest } from "../types/auth";
import {
  type Role,
  type Permission,
  hasRole,
  hasAllPermissions,
  isValidRole,
} from "../../../../packages/types/src/roles";
import { User } from "../models/User";
import { asObjectId } from "../utils/auth";

/**
 * Verify JWT token and attach `req.auth` with typed payload.
 * Checks Authorization Bearer header first, then falls back to httpOnly tc_session cookie.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.header("Authorization");
  const token = hdr?.startsWith("Bearer ") ? hdr.slice(7) : req.cookies?.tc_session;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyToken(token);
    // Normalize roles: filter to valid roles only for defense in depth
    const validRoles = (payload.roles || []).filter(
      (r: string): r is Role => isValidRole(r)
    );
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
 * Check that the user has at least one of the specified roles.
 * Respects role hierarchy: OWNER > ADMIN > AGENT > READONLY.
 * Lateral roles (BILLING, INTEGRATION, CUSTOMER) must match exactly.
 */
export function requireRoles(...roles: (Role | string)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const ok = roles.some((required) => hasRole(auth.roles, required as Role));
    return ok ? next() : res.status(403).json({ error: "Forbidden" });
  };
}

/**
 * Check that the user has the EXACT role specified (no hierarchy).
 * Use for sensitive operations like ownership transfer.
 */
export function requireExactRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    if (!auth.roles.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/**
 * Check that the user has ALL of the specified permissions.
 * Permissions are derived from the user's roles via the role-permission matrix.
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    if (!hasAllPermissions(auth.roles, permissions)) {
      return res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
    }
    next();
  };
}

const PRIVILEGED_ROLES: Role[] = ["OWNER", "ADMIN"];
const MFA_EXEMPT_PATHS = ["/api/v1/mfa", "/api/v1/auth", "/api/v1/gdpr", "/healthz"];

/**
 * Block OWNER/ADMIN users who have not enabled MFA from accessing protected routes.
 * Exempt: auth, MFA setup, GDPR, and health endpoints.
 */
export function requireMfaForPrivileged(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthPayload | undefined;
  if (!auth) return next(); // not authenticated yet — let requireAuth handle it

  const isPrivileged = auth.roles.some(r => PRIVILEGED_ROLES.includes(r));
  if (!isPrivileged) return next(); // non-privileged roles skip MFA check

  const isExempt = MFA_EXEMPT_PATHS.some(p => req.originalUrl.startsWith(p));
  if (isExempt) return next();

  // Check DB for MFA status (cached per-request via req)
  const cached = (req as any)._mfaChecked;
  if (cached !== undefined) return cached ? next() : res.status(403).json({ error: "mfa_required", message: "MFA must be enabled for admin accounts." });

  User.findById(asObjectId(auth.sub)).select("mfa.enabled").lean()
    .then(user => {
      const mfaOk = !!user?.mfa?.enabled;
      (req as any)._mfaChecked = mfaOk;
      if (!mfaOk) return res.status(403).json({ error: "mfa_required", message: "MFA must be enabled for admin accounts." });
      next();
    })
    .catch(() => next()); // on DB error, fail open to avoid locking users out
}
