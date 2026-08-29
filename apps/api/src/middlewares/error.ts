import { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../types/auth";
import { AppError } from "../utils/errors";
import { writeActivity } from "../services/activity";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

export async function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : "internal_error";
  const details = err instanceof AppError ? err.details : undefined;

  // store activity log (error)
  try {
    const auth = (req as Partial<AuthRequest>).auth;
    await writeActivity({
      tenantId: auth?.tid, 
      userId: auth?.sub,
      action: JSON.stringify(req.headers) || "ERROR", 
      resource: req.path, 
      level: status > 299? "ERROR": "AUDIT",
      ip: req.ip, 
      ua: req.get('user-agent') ?? undefined,
      route: req.originalUrl || req.url || req.route || req.baseUrl || "",
      meta: { code, details, status, body: JSON.stringify(req.body) }
    });
  } catch {/* ignored */}

  // Forward the error, do not swallow it. Calling next() without an argument
  // tells Express the error is handled and to resume ordinary middleware, so
  // the JSON error handler mounted after this one never ran: unhandled errors
  // came back as Express's default HTML page and were never written to
  // ErrorLog. This middleware records activity; it does not terminate.
  _next(err);
}
