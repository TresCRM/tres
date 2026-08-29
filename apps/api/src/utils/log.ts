import { Request } from "express";
import { ErrorLog } from "../models/ErrorLog";
import { ActivityLog } from "../models/ActivityLog";

export async function logError(req: Request, params: {
  code: string; http: number; message?: string; meta?: any;
}) {
  const auth = (req as any).auth || {};
  await ErrorLog.create({
    tenantId: auth.tid || null,
    userId: auth.sub || null,
    code: params.code,
    message: params.message,
    http: params.http,
    method: req.method,
    path: req.originalUrl,
    // Never req.route here: it is an Express Route object, and ErrorLog.route is
    // a string — the cast fails and the whole write throws, losing the very
    // error we were trying to record.
    route: req.originalUrl || req.url || req.baseUrl || "",
    requestId: (req.res?.locals?.requestId) || (req.headers["x-request-id"] as string) || (req.headers["idempotency-key"] as string),
    meta: params.meta,
    createdAt: new Date()
  });
}

export async function logActivity(req: Request, params: {
  action: string; http?: number; meta?: any;
}) {
  const auth = (req as any).auth || {};
  await ActivityLog.create({
    tenantId: auth.tid || null,
    userId: auth.sub || null,
    action: params.action,
    http: params.http,
    method: req.method,
    path: req.originalUrl,
    requestId: (req.res?.locals?.requestId) || (req.headers["x-request-id"] as string) || (req.headers["idempotency-key"] as string),
    meta: params.meta,
    createdAt: new Date()
  });
}
