import { Request, Response } from "express";
import { logError } from "./log";

/**
 * The path to report back to the caller.
 *
 * `req.route` is an Express Route *object*, and putting it in a JSON body
 * serialises its internal middleware stack — function names, matchers and all —
 * straight to the client. It was doing exactly that on every 400/402/403/404.
 * The caller only needs the path they asked for.
 */
function routeOf(req: Request): string {
  return req.originalUrl || req.url || req.baseUrl || "";
}

export async function badRequest(req: Request, res: Response, code = "invalid_request", message?: string, meta?: any) {
  await logError(req, { code, http: 400, message, meta });
  return res.status(400).json({ error: code, message, meta, route: routeOf(req) });
}

export async function paymentRequired(req: Request, res: Response, code = "payment_required", message?: string, meta?: any) {
  await logError(req, { code, http: 402, message, meta });
  return res.status(402).json({ error: code, message, route: routeOf(req) });
}

export async function forbidden(req: Request, res: Response, code = "forbidden", message?: string) {
  await logError(req, { code, http: 403, message });
  return res.status(403).json({ error: code, message, route: routeOf(req) });
}

export async function notFound(req: Request, res: Response, code = "not_found", message?: string) {
  await logError(req, { code, http: 404, message });
  return res.status(404).json({ error: code, message, route: routeOf(req) });
}
