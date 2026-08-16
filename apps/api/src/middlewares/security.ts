import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { ENV } from "../config/env";

const skip = () => ENV.DISABLE_RATE_LIMIT;

/** Key generator: uses authenticated user ID if available, otherwise IP (IPv6-safe) */
function userOrIpKey(req: Request): string {
  const auth = (req as any).auth;
  if (auth?.sub) return `user:${auth.sub}`;
  const apiKey = (req as any).apiKey;
  if (apiKey?.keyId) return `apikey:${apiKey.keyId}`;
  return ipKeyGenerator(req.ip || "unknown");
}

/**
 * Create a MongoDB-backed store for rate limiting (scales across instances).
 * Falls back to in-memory if rate-limit-mongo is not installed or MONGO_URI is missing.
 */
function createStore(prefix: string): any {
  try {
    const MongoStore = require("rate-limit-mongo");
    return new MongoStore({
      uri: ENV.MONGO_URI,
      collectionName: "rateLimits",
      expireTimeMs: 60_000,
      errorHandler: () => {}, // fail open on DB errors
    });
  } catch {
    // rate-limit-mongo not installed — use default in-memory store
    return undefined;
  }
}

export const globalLimiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: userOrIpKey,
  store: createStore("global"),
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: ENV.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many auth requests. Try again later." },
  store: createStore("auth"),
});

export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many attempts. Try again later." },
  store: createStore("strict"),
});

export { globalLimiter as rateLimiter };
