import { Express } from "express";
import { emailsRouter } from "./emails";
import { surveysRouter } from "./surveys";
import { publicSurveysRouter } from "./public.surveys";
import { subscriptionsRouter } from "./subscriptions";
import { authRouter } from "./auth";
import { ticketsRouter } from "./tickets";
import { logsRouter } from "./logs";
import { authLimiter } from "../middlewares/security";

export function mountRoutes(app: Express) {
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/subscriptions", subscriptionsRouter);
  app.use("/api/v1/tickets", ticketsRouter);
  app.use("/api/v1/logs", logsRouter);
  app.use("/api/v1/emails", emailsRouter);
  app.use("/api/v1/surveys", surveysRouter);
  app.use("/public", publicSurveysRouter);
}