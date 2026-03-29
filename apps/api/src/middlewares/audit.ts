import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../types/auth";
import { ActivityLog } from "../models/ActivityLog";
import { redactBody, redactHeaders } from "../utils/redact";
import { asObjectId } from "../utils/auth";

const enabled = process.env.ACTIVITY_LOG_ENABLED === "1";
const persistBody = process.env.ACTIVITY_LOG_BODY === "1";

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!enabled) return next();

  const started = Date.now();
  const method = req.method.toUpperCase();
  const idempo = (req.headers["idempotency-key"] as string) || undefined;
  // Capture URL eagerly -- req.route may be undefined inside res.on("finish") in Express 5
  const capturedUrl = req.originalUrl || req.url || req.baseUrl || "";

  res.on("finish", () => {
    try {
      const auth = (req as Partial<AuthRequest>).auth || {} as any;
      const ctx  = (req as any).ctx  || {};
      const durationMs = Date.now() - started;

      const tenantId = auth?.tid ? asObjectId(auth.tid) : undefined;
      const actorId  = auth?.sub ? asObjectId(auth.sub) : undefined;

      // Optional: only log mutating or all
      const shouldLog = true; // or ["POST","PUT","PATCH","DELETE"].includes(method)
      if (!shouldLog) return;

      const doc = {
        tenantId,
        actorId,
        roles: auth?.roles || [],
        method,
        route: capturedUrl,
        status: res.statusCode,
        durationMs,
        requestId: ctx.requestId,
        idempotencyKey: idempo,
        ip: ctx.ip,
        ua: ctx.ua,
        query: req.query,
        body: persistBody ? redactBody(req.body) : undefined,
        createdAt: new Date()
      };
      // fire & forget
      setImmediate(() => ActivityLog.create(doc).catch(() => {}));
    } catch { /* never throw */ }
  });

  next();
}
