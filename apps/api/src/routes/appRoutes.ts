import { Express } from "express";
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
import { apikeysRouter } from "./apikeys";
import { webhooksRouter } from "./webhooks";
import { extRouter } from "./ext";
import { widgetSettingsRouter } from "./widgetSettings";
import { publicWidgetRouter } from "./public.widget";
import { mfaRouter } from "./mfa";
import { gdprRouter } from "./gdpr";
import { requireMfaForPrivileged } from "../middlewares/auth";
import { authLimiter, strictLimiter } from "../middlewares/security";
import { adminRouter } from "../admin/routes";

export function mountRoutes(app: Express) {
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // Auth, MFA, GDPR — exempt from MFA enforcement (users need these to set up MFA)
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/mfa", authLimiter, mfaRouter);
  app.use("/api/v1/gdpr", strictLimiter, gdprRouter);

  // Protected routes — MFA enforced for OWNER/ADMIN after requireAuth runs per-router
  app.use("/api/v1/subscriptions", requireMfaForPrivileged, subscriptionsRouter);
  app.use("/api/v1/tickets", requireMfaForPrivileged, ticketsRouter);
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
  app.use("/api/v1/webhooks", requireMfaForPrivileged, webhooksRouter);
  app.use("/api/v1/ext", extRouter); // ext uses API key auth, not JWT — no MFA

  // Admin routes — separated from tenant routes, own middleware stack
  app.use("/api/v1/admin", adminRouter);

  // Public routes — no auth required
  app.use("/public", strictLimiter, publicSurveysRouter);
  app.use("/public", strictLimiter, publicTicketsRouter);
  app.use("/public", strictLimiter, publicWidgetRouter);
}