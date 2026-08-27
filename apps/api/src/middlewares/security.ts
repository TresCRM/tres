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
 *
 * Two things this must get right, both of which were previously wrong:
 *  - Each limiter needs its own collection. They key on the same values (an IP,
 *    a user id), so sharing one collection makes unrelated limiters share a
 *    counter and trip each other.
 *  - The record lifetime has to cover the window. A fixed 60s expiry silently
 *    caps every limiter at one minute, so an hourly or daily budget resets
 *    sixty times an hour.
 */
function createStore(prefix: string, windowMs: number): any {
  // Under test the app runs against an ephemeral in-memory Mongo whose address
  // is not ENV.MONGO_URI, so this store would dial a server that is not there.
  // The library's built-in memory store keeps limiter behaviour testable
  // without opening a second connection.
  if (ENV.IS_TEST) return undefined;

  try {
    const MongoStore = require("rate-limit-mongo");
    return new MongoStore({
      uri: ENV.MONGO_URI,
      collectionName: `rateLimits_${prefix}`,
      expireTimeMs: windowMs,
      // This store dials Mongo itself rather than sharing the app's connection.
      // Without a short selection timeout an unreachable server does not fail
      // open promptly — it holds each request for the driver's default (30s,
      // and longer once retries stack), so a datastore blip turns into a stall
      // on every rate-limited route. Fail fast, then fail open.
      connectionOptions: { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 },
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
  store: createStore("global", ENV.RATE_LIMIT_WINDOW_MS),
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: ENV.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many auth requests. Try again later." },
  store: createStore("auth", 60_000),
});

export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many attempts. Try again later." },
  store: createStore("strict", 60_000),
});

export { globalLimiter as rateLimiter };

/* ─── Public / widget abuse limits ──────────────────────────────────
 *
 * The generic strictLimiter in front of /public is a per-IP request budget. It
 * does not bound the things that actually cost money here: raising tickets, and
 * hammering a single widget token. These add those bounds.
 *
 * All of them fail open if the Mongo store is unreachable (see createStore),
 * which is the existing trade-off across this file: availability over
 * enforcement when the datastore is down.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Ticket creation from a single address. */
export const publicTicketIpLimiter = rateLimit({
  windowMs: HOUR_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip || "unknown"),
  message: { error: "rate_limited", message: "Too many tickets from this address. Try again later." },
  store: createStore("public_ticket_ip", HOUR_MS),
});

/**
 * Ticket creation naming a single customer email.
 *
 * Keyed on the body, so it bounds a distributed submitter that rotates IPs but
 * keeps impersonating one address. Requests without an email fall back to the
 * IP key rather than sharing one bucket, which would let a single malformed
 * request lock the endpoint for everyone.
 */
export const publicTicketEmailLimiter = rateLimit({
  windowMs: DAY_MS,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => {
    // /public/tickets calls it customerEmail; the widget calls it email.
    // Reading the wrong one silently degrades this to a second IP limiter.
    const body = (req.body as any) || {};
    const email = String(body.customerEmail || body.email || "").trim().toLowerCase();
    return email ? `email:${email}` : ipKeyGenerator(req.ip || "unknown");
  },
  message: { error: "rate_limited", message: "Too many tickets for this email address today." },
  store: createStore("public_ticket_email", DAY_MS),
});

/** Resolve the widget token from wherever the endpoint carries it. */
function widgetTokenKey(req: Request): string {
  const token =
    (req.body as any)?.widgetToken ||
    (req.query as any)?.token ||
    (req.query as any)?.widgetToken;
  return token ? `widget:${String(token)}` : ipKeyGenerator(req.ip || "unknown");
}

/** Overall request budget for one widget token. */
export const widgetTokenLimiter = rateLimit({
  windowMs: HOUR_MS,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: widgetTokenKey,
  message: { error: "rate_limited", message: "Widget request limit reached. Try again later." },
  store: createStore("widget_token", HOUR_MS),
});

/** Ticket creation budget for one widget token. */
export const widgetTicketLimiter = rateLimit({
  windowMs: HOUR_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: widgetTokenKey,
  message: { error: "rate_limited", message: "Too many tickets from this widget. Try again later." },
  store: createStore("widget_ticket", HOUR_MS),
});
