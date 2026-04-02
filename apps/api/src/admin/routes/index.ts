/**
 * @module admin/routes
 * Mount all admin routes under /api/v1/admin/*.
 *
 * Middleware stack (in order):
 *  1. adminIpGuard          — optional IP allow-list
 *  2. adminRateLimiter      — strict 30 req/min
 *  3. requireAdminAuth      — JWT + admin role verification
 *  4. adminSessionFingerprint — UA drift detection
 *  5. requireAdminMfa       — mandatory MFA for all admin users
 *  6. adminAudit            — full request audit logging
 *  7. per-route RBAC        — role/permission checks in each router
 */
import { Router } from "express";
import {
  requireAdminAuth,
  requireAdminMfa,
  adminRateLimiter,
  adminIpGuard,
  adminSessionFingerprint,
  adminAudit,
} from "../middleware";
import { adminTenantsRouter } from "./tenants";
import { adminUsersRouter } from "./users";
import { adminSubscriptionsRouter } from "./subscriptions";
import { adminTicketsRouter } from "./tickets";
import { adminAnalyticsRouter } from "./analytics";
import { adminContentRouter } from "./content";
import { adminAuditRouter } from "./audit";
import { adminSettingsRouter } from "./settings";
import { adminAnnouncementsRouter } from "./announcements";
import { adminErrorsRouter } from "./errors";

export const adminRouter = Router();

// ─── Security middleware stack (order matters) ───────────────────────
adminRouter.use(adminIpGuard);
adminRouter.use(adminRateLimiter);
adminRouter.use(requireAdminAuth);
adminRouter.use(adminSessionFingerprint);
adminRouter.use(requireAdminMfa);
adminRouter.use(adminAudit);

// ─── Resource routes ─────────────────────────────────────────────────
adminRouter.use("/tenants", adminTenantsRouter);
adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/subscriptions", adminSubscriptionsRouter);
adminRouter.use("/tickets", adminTicketsRouter);
adminRouter.use("/analytics", adminAnalyticsRouter);
adminRouter.use("/content", adminContentRouter);
adminRouter.use("/audit", adminAuditRouter);
adminRouter.use("/settings", adminSettingsRouter);
adminRouter.use("/announcements", adminAnnouncementsRouter);
adminRouter.use("/errors", adminErrorsRouter);
