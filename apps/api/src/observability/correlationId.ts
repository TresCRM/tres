import type { Request, Response, NextFunction } from "express";
import { getTraceId } from "./tracing";

/**
 * Attaches the OpenTelemetry traceId to the request context and response
 * headers so that every log / downstream call can be correlated.
 */
export function correlationId(req: Request, _res: Response, next: NextFunction) {
  const ctx = (req as any).ctx;
  const traceId = getTraceId();

  if (traceId) {
    if (ctx) ctx.traceId = traceId;
    _res.setHeader("x-trace-id", traceId);
  }

  next();
}
