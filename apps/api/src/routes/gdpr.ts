/**
 * @module routes/gdpr
 * GDPR Article 15 (data export) and Article 17 (right to erasure) endpoints.
 */
import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { User } from "../models/User";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Customer } from "../models/Customer";
import { RefreshToken } from "../models/RefreshToken";
import { ActivityLog } from "../models/ActivityLog";
import { ApiKey } from "../models/ApiKey";
import { logSecurityEvent } from "../services/securityLogger";

export const gdprRouter = Router();
gdprRouter.use(requireAuth);

/** POST /api/v1/gdpr/export — export all user data (Art. 15) */
gdprRouter.post("/export", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const userId = asObjectId(auth.sub);
  const tenantId = asObjectId(auth.tid);

  const [user, tickets, comments, sessions, activity, apiKeys] = await Promise.all([
    User.findById(userId).select("-passwordHash -mfa.secret -mfa.recoveryCodes").lean(),
    Ticket.find({ tenantId, $or: [{ createdBy: userId }, { assigneeId: userId }] }).select("-__v").lean(),
    Comment.find({ tenantId, authorId: userId }).select("-__v").lean(),
    RefreshToken.find({ userId }).select("deviceInfo ip createdAt expiresAt revokedAt").lean(),
    ActivityLog.find({ actorId: userId }).sort({ _id: -1 }).limit(500).select("-__v").lean(),
    ApiKey.find({ tenantId, createdBy: userId }).select("name scopes createdAt expiresAt isActive").lean(),
  ]);

  logSecurityEvent({ event: "auth.login.success", userId: auth.sub, tenantId: auth.tid, ip: req.ip, userAgent: req.headers["user-agent"] as string, metadata: { action: "gdpr_export" } });

  res.setHeader("Content-Disposition", "attachment; filename=tres-crm-data-export.json");
  res.setHeader("Content-Type", "application/json");
  return res.json({
    exportedAt: new Date().toISOString(),
    user,
    tickets: tickets.length,
    ticketData: tickets,
    comments: comments.length,
    commentData: comments,
    sessions,
    activityLogs: activity.length,
    activityData: activity,
    apiKeys,
  });
});

/** DELETE /api/v1/gdpr/delete — anonymize/delete user data (Art. 17) */
gdprRouter.delete("/delete", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const userId = asObjectId(auth.sub);
  const tenantId = asObjectId(auth.tid);

  // Anonymize user record (don't fully delete — preserve tenant integrity)
  await User.updateOne({ _id: userId }, {
    $set: {
      firstName: "[deleted]",
      lastName: "[deleted]",
      email: `deleted-${userId}@erased.local`,
      passwordHash: "ERASED",
      status: "DISABLED",
      mfa: undefined,
      emailVerification: undefined,
    },
  });

  // Anonymize user references in tickets/comments
  await Promise.all([
    Ticket.updateMany({ tenantId, createdBy: userId }, { $set: { customerEmail: "erased@erased.local" } }),
    Comment.updateMany({ tenantId, authorId: userId }, { $set: { body: "[Content deleted per GDPR request]" } }),
    // Revoke all sessions
    RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() }),
    // Deactivate API keys
    ApiKey.updateMany({ tenantId, createdBy: userId }, { $set: { isActive: false } }),
    // Anonymize activity logs
    ActivityLog.updateMany({ actorId: userId }, { $set: { ip: "0.0.0.0", ua: "erased" } }),
  ]);

  logSecurityEvent({ event: "auth.login.success", userId: auth.sub, tenantId: auth.tid, ip: req.ip, userAgent: req.headers["user-agent"] as string, metadata: { action: "gdpr_deletion" } });

  return res.json({ ok: true, message: "Your data has been anonymized and your account disabled." });
});
