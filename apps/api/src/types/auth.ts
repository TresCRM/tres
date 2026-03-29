/**
 * @module types/auth
 * Typed auth context for Express requests.
 * Eliminates all `(req as any).auth` casts across the codebase.
 */
import type { Request } from "express";
import type { Role, Permission } from "../../../../packages/types/src/roles";

export interface AuthPayload {
  /** User ID (MongoDB ObjectId as string) */
  sub: string;
  /** Tenant ID (MongoDB ObjectId as string) */
  tid: string;
  /** Assigned roles */
  roles: Role[];
}

/**
 * Express Request with verified auth payload attached by `requireAuth` middleware.
 */
export interface AuthRequest extends Request {
  auth: AuthPayload;
}

/**
 * Request context set by `requestContext` middleware.
 */
export interface RequestContext {
  requestId: string;
  startedAt: Date;
  ip: string;
  ua: string;
}

export interface ContextualRequest extends Request {
  ctx: RequestContext;
  auth?: AuthPayload;
  getResponseTime?: () => number;
}
