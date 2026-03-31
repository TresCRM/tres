import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { ENV } from "../config/env";

const skip = () => ENV.DISABLE_RATE_LIMIT;

/** Key generator: uses authenticated user ID if available, otherwise IP */
function userOrIpKey(req: Request): string {
  const auth = (req as any).auth;
  if (auth?.sub) return `user:${auth.sub}`;
  const apiKey = (req as any).apiKey;
  if (apiKey?.keyId) return `apikey:${apiKey.keyId}`;
  return req.ip || "unknown";
}

export const globalLimiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: userOrIpKey,
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: ENV.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many auth requests. Try again later." },
});

export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many attempts. Try again later." },
});

export { globalLimiter as rateLimiter };
