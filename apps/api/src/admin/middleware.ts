/**
 * @module admin/middleware
 * Admin-specific authentication and authorization middleware.
 * Separated from tenant middleware — admin routes operate cross-tenant.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
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
