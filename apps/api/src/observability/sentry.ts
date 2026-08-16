/**
 * Sentry error-tracking integration (optional dependency).
 *
 * If `@sentry/node` is not installed the module exports harmless no-ops
 * so the rest of the application keeps working without any changes.
 *
 * Supports @sentry/node v8+ (setupExpressErrorHandler) and legacy v7 (Handlers).
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
  if (Sentry?.captureException) {
    Sentry.captureException(err);
  } else {
    console.error("[sentry:noop] captureException —", err);
  }
}

/** Express request handler (v7 compat — v8+ does this automatically). */
export function sentryRequestHandler(): any {
  if (Sentry?.Handlers?.requestHandler) {
    return Sentry.Handlers.requestHandler();
  }
  // v8+ or not installed — no-op middleware
  return (_req: any, _res: any, next: any) => next();
}

/**
 * Express error handler.
 * v8+: uses setupExpressErrorHandler (called once, returns middleware).
 * v7:  uses Handlers.errorHandler().
 */
export function sentryErrorHandler(): any {
  // v8+ API
  if (Sentry?.setupExpressErrorHandler) {
    // setupExpressErrorHandler expects the app, but we can also use
    // the lower-level expressErrorHandler if available
    if (Sentry.expressErrorHandler) {
      return Sentry.expressErrorHandler();
    }
    // Fallback: manual error capture middleware
    return (err: any, _req: any, _res: any, next: any) => {
      Sentry.captureException(err);
      next(err);
    };
  }
  // v7 API
  if (Sentry?.Handlers?.errorHandler) {
    return Sentry.Handlers.errorHandler();
  }
  // no-op error middleware (4-arity so Express treats it as error handler)
  return (err: any, _req: any, _res: any, next: any) => next(err);
}

/**
 * Call this with your Express app AFTER all routes are mounted (v8+ only).
 * For v7, sentryErrorHandler() is sufficient.
 */
export function setupSentryExpress(app: any): void {
  if (Sentry?.setupExpressErrorHandler) {
    Sentry.setupExpressErrorHandler(app);
  }
}
