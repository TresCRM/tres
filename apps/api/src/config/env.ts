/**
 * @module config/env
 * Centralized environment configuration. All process.env reads happen here.
 * Fail-fast on startup if required variables are missing or have dangerous defaults.
 */
import "dotenv/config";

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`[env] ${key} must be an integer, got "${raw}"`);
  return n;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "1" || raw === "true";
}

const NODE_ENV = optional("NODE_ENV", "development");
const isTest = NODE_ENV === "test";
const isProd = NODE_ENV === "production";

function secretRequired(key: string, fallback?: string): string {
  const v = required(key, fallback);
  const DANGEROUS_DEFAULTS = [
    "dev-super-secret",
    "dev-secret-change",
    "replace_me_access_secret",
    "replace_me_refresh_secret",
  ];
  if (isProd && DANGEROUS_DEFAULTS.includes(v)) {
    throw new Error(`[env] FATAL: ${key} is using a default/dev value in production. Set a strong random secret.`);
  }
  return v;
}

export const ENV = {
  NODE_ENV,
  IS_TEST: isTest,
  IS_PROD: isProd,

  PORT: int("PORT", 4000),
  MONGO_URI: required("MONGO_URI"),

  // --- JWT ---
  JWT_SECRET: secretRequired("JWT_SECRET", isTest ? "test-jwt-secret" : undefined),
  get JWT_ACCESS_SECRET(): string {
    const v = process.env.JWT_ACCESS_SECRET;
    // Fall back to JWT_SECRET if not set, or if it's a known placeholder
    if (!v || v === "replace_me_access_secret") return this.JWT_SECRET;
    return v;
  },
  get JWT_REFRESH_SECRET(): string {
    const v = process.env.JWT_REFRESH_SECRET;
    if (!v || v === "replace_me_refresh_secret") return this.JWT_SECRET;
    return v;
  },
  ACCESS_TOKEN_TTL_SECONDS: int("ACCESS_TOKEN_TTL_SECONDS", 900),
  REFRESH_TOKEN_TTL_SECONDS: int("REFRESH_TOKEN_TTL_SECONDS", 1_209_600),

  // --- SMTP (unified: SMTP_* takes precedence over SMTP_DEFAULT_*) ---
  SMTP: {
    HOST: optional("SMTP_HOST", optional("SMTP_DEFAULT_HOST", "localhost")),
    PORT: int("SMTP_PORT", int("SMTP_DEFAULT_PORT", 1025)),
    SECURE: bool("SMTP_SECURE", bool("SMTP_DEFAULT_SECURE", false)),
    USER: process.env.SMTP_USER || undefined,
    PASS: process.env.SMTP_PASS || undefined,
  },
  FROM_EMAIL: optional("FROM_EMAIL", "no-reply@trescrm.local"),
  EMAILS_DISABLED: bool("EMAILS_DISABLED", isTest),

  // --- NATS / Events ---
  EVENTS_URL: optional("EVENTS_URL", ""),

  // --- App ---
  APP_HOST: optional("APP_HOST", "http://localhost:4000"),
  FRONTEND_ORIGIN: optional("FRONTEND_ORIGIN", "http://localhost:3000"),

  // --- CORS ---
  ALLOWED_ORIGINS: optional("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:4000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // --- Cookies ---
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  COOKIE_SECURE: bool("COOKIE_SECURE", isProd),
  COOKIE_SAMESITE: optional("COOKIE_SAMESITE", "lax") as "lax" | "strict" | "none",

  // --- Activity Logging ---
  ACTIVITY_LOG_ENABLED: bool("ACTIVITY_LOG_ENABLED", true),
  ACTIVITY_LOG_BODY: bool("ACTIVITY_LOG_BODY", false),
  ACTIVITY_LOG_TTL_DAYS: int("ACTIVITY_LOG_TTL_DAYS", 30),
  ERROR_LOG_TTL_DAYS: int("ERROR_LOG_TTL_DAYS", 60),

  // --- Surveys ---
  SURVEY_JWT_SECRET: secretRequired("SURVEY_JWT_SECRET", isTest ? "test-survey-secret" : undefined),
  SURVEY_TOKEN_TTL_DAYS: int("SURVEY_TOKEN_TTL_DAYS", 14),
  SURVEY_DEFAULT_SUBJECT: optional("SURVEY_DEFAULT_SUBJECT", "How did we do?"),
  SURVEY_DEFAULT_TEMPLATE_KEY: optional("SURVEY_DEFAULT_TEMPLATE_KEY", "survey.ticket_closed"),

  // --- Billing ---
  GRACE_DAYS: int("GRACE_DAYS", 7),
  BILLING_PROVIDER: optional("BILLING_PROVIDER", "manual"),
  BILLING_FROM_EMAIL: optional("BILLING_FROM_EMAIL", "billing@trescrm.local"),

  // --- Rate Limiting ---
  RATE_LIMIT_WINDOW_MS: int("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: int("RATE_LIMIT_MAX", 120),
  AUTH_RATE_LIMIT_MAX: int("AUTH_RATE_LIMIT_MAX", 10),
  DISABLE_RATE_LIMIT: bool("DISABLE_RATE_LIMIT", isTest),

  // --- Security ---
  ACCOUNT_LOCKOUT_ATTEMPTS: int("ACCOUNT_LOCKOUT_ATTEMPTS", 10),
  ACCOUNT_LOCKOUT_MINUTES: int("ACCOUNT_LOCKOUT_MINUTES", 30),
  PASSWORD_MIN_LENGTH: int("PASSWORD_MIN_LENGTH", 10),
  PASSWORD_MAX_AGE_DAYS: int("PASSWORD_MAX_AGE_DAYS", 90),
};
