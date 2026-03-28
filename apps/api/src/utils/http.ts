import { Request, Response } from "express";
import { logError } from "./log";

export async function badRequest(req: Request, res: Response, code = "invalid_request", message?: string, meta?: any) {
  await logError(req, { code, http: 400, message, meta });
  return res.status(400).json({ error: code, message, meta, route: req.route || req.url || req.baseUrl });
}

export async function paymentRequired(req: Request, res: Response, code = "payment_required", message?: string, meta?: any) {
  await logError(req, { code, http: 402, message, meta });
  return res.status(402).json({ error: code, message, route: req.route || req.url || req.baseUrl });
}

export async function forbidden(req: Request, res: Response, code = "forbidden", message?: string) {
  await logError(req, { code, http: 403, message });
  return res.status(403).json({ error: code, message, route: req.route || req.url || req.baseUrl });
}

export async function notFound(req: Request, res: Response, code = "not_found", message?: string) {
  await logError(req, { code, http: 404, message });
  return res.status(404).json({ error: code, message, route: req.route || req.url || req.baseUrl });
}
