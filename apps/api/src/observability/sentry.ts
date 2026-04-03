/**
 * Sentry error-tracking integration (optional dependency).
 *
 * If `@sentry/node` is not installed the module exports harmless no-ops
 * so the rest of the application keeps working without any changes.
 */

let Sentry: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require("@sentry/node");
} catch {
  // @sentry/node not installed — fall through to no-op exports
}

/* ------------------------------------------------------------------ */
/*  Public helpers                                                     */
/* ------------------------------------------------------------------ */

/** Initialise Sentry SDK. Safe to call even when the package is absent. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || !Sentry) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    release: process.env.npm_package_version || "1.0.0",
  });
}

/** Report an exception to Sentry (falls back to console.error). */
export function captureException(err: any): void {
  if (Sentry) {
    Sentry.captureException(err);
  } else {
    console.error("[sentry:noop] captureException —", err);
  }
}

/** Express request handler that feeds data into Sentry traces. */
export function sentryRequestHandler(): any {
  if (Sentry?.Handlers?.requestHandler) {
    return Sentry.Handlers.requestHandler();
  }
  // no-op middleware
  return (_req: any, _res: any, next: any) => next();
}

/** Express error handler that reports unhandled errors to Sentry. */
export function sentryErrorHandler(): any {
  if (Sentry?.Handlers?.errorHandler) {
    return Sentry.Handlers.errorHandler();
  }
  // no-op error middleware (4-arity so Express treats it as error handler)
  return (err: any, _req: any, _res: any, next: any) => next(err);
}
