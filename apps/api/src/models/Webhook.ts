import mongoose, { Schema, Types } from "mongoose";

export interface WebhookDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  failCount: number;
  lastTriggeredAt?: Date;
  lastFailedAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<WebhookDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  url: { type: String, required: true },
  secret: { type: String, required: true },
  events: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  failCount: { type: Number, default: 0 },
  lastTriggeredAt: Date,
  lastFailedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

WebhookSchema.index({ tenantId: 1, isActive: 1 });

export const Webhook = mongoose.model<WebhookDoc>("Webhook", WebhookSchema);
