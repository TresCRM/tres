import mongoose, { Schema, Types } from "mongoose";
import { TICKET_STATUSES, type TicketStatus } from "../utils/ticket-state-machine";

export type { TicketStatus };

export interface StatusHistoryEntry {
  from: string;
  to: string;
  changedBy: Types.ObjectId | string;
  reason?: string;
  timestamp: Date;
}

export interface TicketDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeId?: Types.ObjectId;
  customerEmail?: string;
  tags?: string[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  requestId?: string;
  watchers?: string[];
  assignmentHistory?: { assigneeId: Types.ObjectId; assignedAt: Date; reassignedAt?: Date }[];
  statusHistory: StatusHistoryEntry[];
  closedBy?: string;       // userId or 'system' (for TTL auto-close)
  closeReason?: string;    // 'manual' | 'merged' | 'ttl_auto_close'
  mergedInto?: Types.ObjectId;
  isSandbox?: boolean;
  // AI triage (populated by AI service)
  aiTriage?: {
    issueType?: string;
    subType?: string;
    priority?: string;
    sentiment?: string;
    language?: string;
    suggestedGroup?: string;
    confidence?: number;
    reasoning?: string;
    classifiedAt?: Date;
    overriddenBy?: string;
    overriddenAt?: Date;
  };
  // TTL tracking
  ttlRemindersSent?: number;
  ttlLastReminderAt?: Date;
  ttlPausedUntil?: Date;
  customFields?: Map<string, any>;
  // SLA tracking (populated in Stage 1.5)
  sla?: {
    policyId?: Types.ObjectId;
    firstResponseDue?: Date;
    resolutionDue?: Date;
    firstRespondedAt?: Date;
    resolvedAt?: Date;
    firstResponseBreached?: boolean;
    resolutionBreached?: boolean;
    pausedAt?: Date;
    totalPausedMs?: number;
  };
}

const StatusHistorySchema = new Schema<StatusHistoryEntry>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  changedBy: { type: Schema.Types.Mixed, required: true },
  reason: String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const SlaSchema = new Schema({
  policyId: { type: Schema.Types.ObjectId, ref: "SlaPolicy" },
  firstResponseDue: Date,
  resolutionDue: Date,
  firstRespondedAt: Date,
  resolvedAt: Date,
  firstResponseBreached: { type: Boolean, default: false },
  resolutionBreached: { type: Boolean, default: false },
  pausedAt: Date,
  totalPausedMs: { type: Number, default: 0 },
}, { _id: false });

const TicketSchema = new Schema<TicketDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: TICKET_STATUSES, default: "OPEN" },
  priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW" },
  assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  customerEmail: String,
  tags: [String],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  requestId: { type: String, index: true, default: undefined },
  watchers: [String],
  assignmentHistory: {
    type: [{ assigneeId: Schema.Types.ObjectId, assignedAt: Date, reassignedAt: Date }],
    default: [],
  },
  statusHistory: { type: [StatusHistorySchema], default: [] },
  closedBy: String,
  closeReason: String,
  mergedInto: { type: Schema.Types.ObjectId, ref: "Ticket" },
  isSandbox: { type: Boolean, default: false, index: true },
  // AI Triage
  aiTriage: {
    type: new Schema({
      issueType: String,
      subType: String,
      priority: String,
      sentiment: String,
      language: String,
      suggestedGroup: String,
      confidence: Number,
      reasoning: String,
      classifiedAt: Date,
      overriddenBy: String,
      overriddenAt: Date,
    }, { _id: false }),
    default: undefined,
  },
  // TTL
  ttlRemindersSent: { type: Number, default: 0 },
  ttlLastReminderAt: Date,
  ttlPausedUntil: Date,
  customFields: { type: Map, of: Schema.Types.Mixed, default: undefined },
  // SLA
  sla: { type: SlaSchema, default: undefined },
}, { timestamps: true });

TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
TicketSchema.index(
  { tenantId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } }
);
TicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
TicketSchema.index(
  { subject: "text", body: "text" },
  { weights: { subject: 10, body: 1 } }
);
// TTL worker index: find stale tickets efficiently
TicketSchema.index({ tenantId: 1, status: 1, updatedAt: 1 });
// SLA worker index: find tickets approaching SLA breach
TicketSchema.index({ "sla.firstResponseDue": 1, "sla.firstRespondedAt": 1 });
TicketSchema.index({ "sla.resolutionDue": 1, "sla.resolvedAt": 1 });

export const Ticket = mongoose.model<TicketDoc>("Ticket", TicketSchema);
