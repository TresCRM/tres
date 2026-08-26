import mongoose, { Schema, Types } from "mongoose";

/**
 * Record of an inbound provider webhook we have already acted on.
 *
 * Providers retry until they see a 2xx, so the same event arrives repeatedly.
 * Without this, a retried charge.success would extend the billing period and
 * raise another invoice each time. The unique index is the actual guard: the
 * insert is attempted before any handler runs, and a duplicate-key error means
 * another delivery already claimed this event.
 */
export interface ProcessedWebhookEventDoc {
  _id: Types.ObjectId;
  provider: string;
  /** Stable per-event identifier from the provider, or a payload digest. */
  eventKey: string;
  eventType?: string;
  createdAt: Date;
}

const ProcessedWebhookEventSchema = new Schema<ProcessedWebhookEventDoc>(
  {
    provider: { type: String, required: true },
    eventKey: { type: String, required: true },
    eventType: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ProcessedWebhookEventSchema.index({ provider: 1, eventKey: 1 }, { unique: true });
// Retries arrive within hours; 30 days is ample and keeps the collection bounded.
ProcessedWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

export const ProcessedWebhookEvent = mongoose.model<ProcessedWebhookEventDoc>(
  "ProcessedWebhookEvent",
  ProcessedWebhookEventSchema
);
