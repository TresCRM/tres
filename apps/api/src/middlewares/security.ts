import rateLimit from "express-rate-limit";
import { ENV } from "../config/env";

const skip = () => ENV.DISABLE_RATE_LIMIT;

export const globalLimiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
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
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "rate_limited", message: "Too many attempts. Try again later." },
});

export { globalLimiter as rateLimiter };
