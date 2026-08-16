import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import crypto from "crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { errorHandler as activityHandler } from "./middlewares/error";
import { surveyOnTicketClosed } from "./events/handlers/surveyOnTicketClosed";
import { notifyStaffOnReply } from "./events/handlers/notifyStaffOnReply";
import { errorHandler } from "./middlewares/errorHandler";
import { rateLimiter } from "./middlewares/security";
import { mountDocs } from "./docs/swagger";
import { mountRoutes } from "./routes/appRoutes";
import { requestContext } from "./middlewares/requestContext";
import { auditMiddleware } from "./middlewares/audit";
import { csrfProtection } from "./middlewares/csrf";
import { metricsMiddleware } from "./observability/metrics";
import { correlationId } from "./observability/correlationId";
import { sentryRequestHandler, sentryErrorHandler, setupSentryExpress } from "./observability/sentry";
import { ENV } from "./config/env";

const log = pino({ transport: { target: "pino-pretty" } });
export const app = express();
surveyOnTicketClosed(process.env.APP_HOST || undefined);
notifyStaffOnReply();

// HTTPS redirect in production (respects reverse proxy X-Forwarded-Proto)
if (ENV.IS_PROD) {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https" && !req.secure) {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security + perf
app.use(requestContext);
app.use(sentryRequestHandler());
app.use(correlationId);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ENV.IS_TEST ? true : ENV.ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({
  logger: log,
  customProps: (req: any) => ({
    tenantId: req.auth?.tid,
    userId: req.auth?.sub,
    requestId: req.ctx?.requestId,
  }),
}));
app.use(rateLimiter);
app.use(metricsMiddleware);
app.use(auditMiddleware);
app.use(csrfProtection);

// Password expiry enforcement (write ops blocked until password changed)
import { passwordExpiryGuard } from "./middlewares/passwordExpiry";
app.use(passwordExpiryGuard);

// CSP with per-request nonce for inline styles
app.use((_req, res, next) => {
  const nonce = crypto.randomBytes(16).toString("base64");
  (res as any).locals.cspNonce = nonce;
  next();
});
app.use((req, res, next) => {
  const nonce = (res as any).locals.cspNonce;
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'", "https:", `'nonce-${nonce}'`],
      "img-src": ["'self'", "data:", "https:"],
    }
  })(req, res, next);
});

// Serve uploaded files with security headers to prevent XSS via uploaded content
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  next();
}, require('express').static(require('path').resolve(process.cwd(), 'uploads')));

// API version header
app.use((_req, res, next) => {
  res.setHeader("X-API-Version", "v1");
  next();
});

// Routes
mountRoutes(app);
// API Docs (Swagger UI + generated OpenAPI)
mountDocs(app);
// 404 + Errors
app.use(activityHandler);
// app.use(notFound);
app.use(sentryErrorHandler());
setupSentryExpress(app);
app.use(errorHandler);

export default app;