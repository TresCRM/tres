import { Express } from "express";
import mongoose from "mongoose";
import { emailsRouter } from "./emails";
import { surveysRouter } from "./surveys";
import { publicSurveysRouter } from "./public.surveys";
import { publicTicketsRouter } from "./public.tickets";
import { subscriptionsRouter } from "./subscriptions";
import { authRouter } from "./auth";
import { ticketsRouter } from "./tickets";
import { customersRouter } from "./customers";
import { logsRouter } from "./logs";
import { usersRouter } from "./users";
import { settingsRouter } from "./settings";
import { addonsRouter } from "./addons";
import { attachmentsRouter } from "./attachments";
import { apikeysRouter, sandboxRouter } from "./apikeys";
import { webhooksRouter } from "./webhooks";
import { extRouter } from "./ext";
import { widgetSettingsRouter } from "./widgetSettings";
import { publicWidgetRouter } from "./public.widget";
import { mfaRouter } from "./mfa";
import { oauthRouter } from "./oauth";
import { gdprRouter } from "./gdpr";
import { requireMfaForPrivileged } from "../middlewares/auth";
import { authLimiter, strictLimiter, widgetTokenLimiter } from "../middlewares/security";
import { adminRouter } from "../admin/routes";
import { invoicesRouter } from "./invoices";
import { paystackWebhookRouter } from "./paystackWebhook";
import { imagekitRouter } from "./imagekit";
import { emailTrackingRouter } from "./emailTracking";
import { chatRouter } from "./chat";
import { videoRouter } from "./video";
import { serviceStatusRouter } from "./serviceStatus";
import { messagesRouter } from "./messages";
import { notificationsRouter } from "./notifications";
import { ticketTemplatesRouter } from "./ticketTemplates";
import { slaPoliciesRouter } from "./slaPolicies";
import { aiRouter } from "./ai";
import { knowledgeRouter } from "./knowledge";
import { customRolesRouter } from "./customRoles";
import { analyticsRouter } from "./analytics";
import { customFieldsRouter } from "./customFields";
import { industryPacksRouter } from "./industryPacks";
import { referralsRouter } from "./referrals";
import { partnersRouter } from "./partners";
import { isShuttingDown } from "../lifecycle";
import { noCache } from "../middlewares/cacheControl";
import { getMetricsText } from "../observability/metrics";

const MONGO_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export function mountRoutes(app: Express) {
  // OpenAPI spec as JSON (no auth required — public documentation)
  app.get("/api/v1/openapi.json", (_req, res) => {
    const { generateOpenApiDocument } = require("../docs/swagger");
    res.json(generateOpenApiDocument());
  });

  app.get("/healthz", (_req, res) => {
    const readyState = mongoose.connection.readyState;
    const mongoStatus = MONGO_STATES[readyState] ?? "unknown";
    const ok = readyState === 1;
    const status = ok ? 200 : 503;
    res.status(status).json({
      ok,
      uptime: process.uptime(),
      mongo: mongoStatus,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/metrics", noCache, (req, res) => {
    // Restrict to internal/monitoring access
    const metricsToken = process.env.METRICS_TOKEN;
    if (metricsToken && req.query.token !== metricsToken && req.headers.authorization !== `Bearer ${metricsToken}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    res.set("Content-Type", "text/plain; version=0.0.4");
    res.send(getMetricsText());
  });

  app.get("/readyz", (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    const ready = mongoReady && !isShuttingDown();
    res.status(ready ? 200 : 503).json({ ready });
  });

  // Auth, MFA, OAuth, GDPR — exempt from MFA enforcement (users need these to set up MFA)
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/mfa", authLimiter, mfaRouter);
  app.use("/api/v1/oauth", authLimiter, oauthRouter);
  app.use("/api/v1/gdpr", strictLimiter, gdprRouter);

  // Subscriptions — exempt from MFA (users need to select a plan during onboarding before MFA setup)
  app.use("/api/v1/subscriptions", subscriptionsRouter);

  // Protected routes — MFA enforced for OWNER/ADMIN after requireAuth runs per-router
  app.use("/api/v1/tickets", requireMfaForPrivileged, ticketsRouter);
  app.use("/api/v1/ticket-templates", requireMfaForPrivileged, ticketTemplatesRouter);
  app.use("/api/v1/customers", requireMfaForPrivileged, customersRouter);
  app.use("/api/v1/logs", requireMfaForPrivileged, logsRouter);
  app.use("/api/v1/users", requireMfaForPrivileged, usersRouter);
  app.use("/api/v1/emails", requireMfaForPrivileged, emailsRouter);
  app.use("/api/v1/surveys", requireMfaForPrivileged, surveysRouter);
  app.use("/api/v1/settings", requireMfaForPrivileged, settingsRouter);
  app.use("/api/v1/settings", requireMfaForPrivileged, widgetSettingsRouter);
  app.use("/api/v1/add-ons", requireMfaForPrivileged, addonsRouter);
  app.use("/api/v1", requireMfaForPrivileged, attachmentsRouter);
  app.use("/api/v1/api-keys", requireMfaForPrivileged, apikeysRouter);
  app.use("/api/v1/sandbox", requireMfaForPrivileged, sandboxRouter);
  app.use("/api/v1/webhooks", requireMfaForPrivileged, webhooksRouter);
  app.use("/api/v1/ext", extRouter); // ext uses API key auth, not JWT — no MFA
  app.use("/api/v1/invoices", requireMfaForPrivileged, invoicesRouter);
  app.use("/api/v1/sla-policies", requireMfaForPrivileged, slaPoliciesRouter);
  app.use("/api/v1/messages", requireMfaForPrivileged, messagesRouter);
  app.use("/api/v1/notifications", requireMfaForPrivileged, notificationsRouter);
  app.use("/api/v1/ai", requireMfaForPrivileged, aiRouter);
  app.use("/api/v1/knowledge", requireMfaForPrivileged, knowledgeRouter);
  app.use("/api/v1/video", requireMfaForPrivileged, videoRouter);
  app.use("/api/v1/roles/custom", requireMfaForPrivileged, customRolesRouter);
  app.use("/api/v1/analytics", requireMfaForPrivileged, analyticsRouter);
  app.use("/api/v1/custom-fields", requireMfaForPrivileged, customFieldsRouter);

  // Industry packs — public GET (onboarding), auth required for POST apply
  app.use("/api/v1/industry-packs", industryPacksRouter);

  // Referral program — auth required except POST /claim (public)
  app.use("/api/v1/referrals", requireMfaForPrivileged, referralsRouter);

  // Partner program — auth required for all routes
  app.use("/api/v1/partners", requireMfaForPrivileged, partnersRouter);

  // ImageKit upload auth — no user auth required (signup uses it before login)
  app.use("/api/v1/imagekit", imagekitRouter);

  // Paystack webhook — raw body, no auth (HMAC SHA-512 signature-verified)
  app.use("/api/v1/webhooks/paystack", paystackWebhookRouter);

  // Email delivery tracking webhook — no auth (provider-signed)
  app.use("/api/v1/email-tracking", emailTrackingRouter);

  // Admin routes — separated from tenant routes, own middleware stack
  app.use("/api/v1/admin", adminRouter);

  // Service status — mixed: public route uses strictLimiter per-route, admin routes use requireAuth
  app.use("/api/v1/service-status", requireMfaForPrivileged, serviceStatusRouter);

  // Live chat — mixed: public visitor routes use strictLimiter per-route, agent routes use requireAuth
  app.use("/api/v1/chat", chatRouter);

  // Public routes — no auth required
  app.use("/public", strictLimiter, publicSurveysRouter);
  app.use("/public", strictLimiter, publicTicketsRouter);
  // Widget traffic is additionally budgeted per token, so one embed cannot
  // exhaust the shared per-IP allowance for every other tenant behind a CDN.
  app.use("/public", strictLimiter, widgetTokenLimiter, publicWidgetRouter);
}