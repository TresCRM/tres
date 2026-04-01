/**
 * @module services/securityLogger
 * Structured security event logger for SIEM ingestion.
 * Outputs JSON to stdout for collection by Datadog/Splunk/ELK.
 * Also persists critical events to MongoDB for in-app audit trail.
 */
import pino from "pino";
import { ActivityLog } from "../models/ActivityLog";

const secLogger = pino({
  name: "security",
  level: "info",
  ...(process.env.NODE_ENV !== "test" ? { transport: { target: "pino-pretty" } } : {}),
});

export type SecurityEventType =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.mfa.challenge"
  | "auth.mfa.success"
  | "auth.mfa.failed"
  | "auth.mfa.enabled"
  | "auth.mfa.disabled"
  | "auth.token.refresh"
  | "auth.token.stolen"
  | "auth.logout"
  | "auth.session.revoked"
  | "auth.session.revoked_all"
  | "auth.password.changed"
  | "auth.password.expired"
  | "auth.signup"
  | "auth.verify"
  | "admin.access_denied"
  | "admin.action";

interface SecurityEvent {
  event: SecurityEventType;
  tenantId?: string;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export function logSecurityEvent(evt: SecurityEvent) {
  // Structured JSON log for SIEM
  secLogger.info({
    type: "security_event",
    event: evt.event,
    tenantId: evt.tenantId,
    userId: evt.userId,
    email: evt.email,
    ip: evt.ip,
    userAgent: evt.userAgent,
    ...evt.metadata,
    timestamp: new Date().toISOString(),
  });

  // Persist critical auth events to DB (fire-and-forget)
  const critical = evt.event.includes("failed") || evt.event.includes("stolen") || evt.event.includes("locked");
  if (critical) {
    setImmediate(() => {
      ActivityLog.create({
        tenantId: evt.tenantId,
        actorId: evt.userId,
        roles: [],
        method: "SECURITY",
        route: evt.event,
        status: 0,
        durationMs: 0,
        ip: evt.ip,
        ua: evt.userAgent,
        body: evt.metadata,
        createdAt: new Date(),
      }).catch(() => {});
    });
  }
}
