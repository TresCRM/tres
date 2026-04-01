/**
 * @module admin/routes
 * Mount all admin routes under /api/v1/admin/*.
 */
import { Router } from "express";
import { adminTenantsRouter } from "./tenants";
import { adminUsersRouter } from "./users";
import { adminSubscriptionsRouter } from "./subscriptions";
import { adminTicketsRouter } from "./tickets";
import { adminAnalyticsRouter } from "./analytics";
import { adminContentRouter } from "./content";
import { adminAuditRouter } from "./audit";
import { adminSettingsRouter } from "./settings";
import { adminAnnouncementsRouter } from "./announcements";

export const adminRouter = Router();

adminRouter.use("/tenants", adminTenantsRouter);
adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/subscriptions", adminSubscriptionsRouter);
adminRouter.use("/tickets", adminTicketsRouter);
adminRouter.use("/analytics", adminAnalyticsRouter);
adminRouter.use("/content", adminContentRouter);
adminRouter.use("/audit", adminAuditRouter);
adminRouter.use("/settings", adminSettingsRouter);
adminRouter.use("/announcements", adminAnnouncementsRouter);
