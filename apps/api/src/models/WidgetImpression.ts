import mongoose, { Schema, Types } from "mongoose";

export type WidgetEvent = "impression" | "badge_click" | "signup_conversion";

export interface WidgetImpressionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  event: WidgetEvent;
  referrerDomain?: string;
  timestamp: Date;
}

const WidgetImpressionSchema = new Schema<WidgetImpressionDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    event: {
      type: String,
      enum: ["impression", "badge_click", "signup_conversion"],
      required: true,
    },
    referrerDomain: String,
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false }
);

WidgetImpressionSchema.index({ tenantId: 1, event: 1, timestamp: 1 });
// TTL: auto-delete after 90 days
WidgetImpressionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const WidgetImpression = mongoose.model<WidgetImpressionDoc>(
  "WidgetImpression",
  WidgetImpressionSchema
);
