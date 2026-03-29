import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../types/auth";
import { ZodError } from "zod";
import { ErrorLog } from "../models/ErrorLog";
import { ERR } from "../constants/errors";
import { HttpError } from "../utils/httpError";
import { asObjectId } from "../utils/auth";
import { MongoServerError } from "mongodb";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const auth = (req as Partial<AuthRequest>).auth || {} as any;
  const ctx  = (req as any).ctx  || {};
  const route = req.originalUrl ? req.originalUrl: (req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl);

  let http = 500, 
      code:any = ERR.INTERNAL.code, 
      message:any = ERR.INTERNAL.message, 
      details: any;

  if (err instanceof HttpError ) {
    http = err.http; code = err.code; message = err.message; details = err.details;
  } else if (err instanceof ZodError) {
    http = 400; 
    code = ERR.VALIDATION.code; 
    message = ERR.VALIDATION.message; 
    details = err.message;
  }

  if (err instanceof MongoServerError && err.code === 11000) {
    http = 409; 
    code = ERR.MONGOERRORS.code; 
    message = ERR.MONGOERRORS.message; 
    details = err.message || 'Duplicate';
  }

  // Persist error log (never throw)
  try {
    const doc = {
      tenantId: auth?.tid ? asObjectId(auth.tid) : undefined,
      actorId:  auth?.sub ? asObjectId(auth.sub) : undefined,
      roles:    auth?.roles || [],
      requestId: ctx.requestId,
      route, 
      method: req.method,
      http, code, message, details,
      stack: process.env.NODE_ENV === "production" ? undefined : String(err?.stack || ""),
      ip: ctx.ip, ua: ctx.ua,
      createdAt: new Date()
    };
    setImmediate(() => ErrorLog.create(doc).catch(() => {}));
  } catch { /* ignore */ }

  // Log
  req.log?.error?.({ err, http, code }, "request failed");

  res.status(http).json({ error: code, message, details });
}
