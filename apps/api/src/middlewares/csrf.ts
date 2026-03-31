import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env";

const CSRF_COOKIE = "_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function shouldSkip(req: Request): boolean {
  // Disabled in test mode (supertest doesn't do browser CSRF flow)
  if (ENV.IS_TEST) return true;
  // API key or Bearer token auth = machine-to-machine, no CSRF needed
  if (req.headers.authorization?.startsWith("Bearer ")) return true;
  if (req.headers["x-api-key"]) return true;
  // Public endpoints, health check, and auth routes (cookie-setting, not cookie-consuming)
  if (req.path.startsWith("/public/")) return true;
  if (req.path === "/healthz") return true;
  if (req.baseUrl?.startsWith("/api/v1/auth") || req.path.startsWith("/api/v1/auth")) return true;
  // Safe methods don't need CSRF
  if (SAFE_METHODS.has(req.method)) return true;
  return false;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Always set/refresh the CSRF cookie if not present
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,    // JS must read this
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    // For this first request, store in req so validation can use it
    (req as any)._csrfToken = token;
  }

  if (shouldSkip(req)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE] || (req as any)._csrfToken;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "csrf_invalid", message: "Invalid or missing CSRF token" });
  }

  // Rotate token after successful use (prevent replay)
  const newToken = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, newToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  next();
}
