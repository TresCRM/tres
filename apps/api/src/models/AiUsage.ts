import mongoose, { Schema, Types } from "mongoose";

export interface AiUsageDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  month: string; // "2026-04"
  creditsUsed: number;
  creditsLimit: number;
  breakdown: {
    triage: number;
    replies: number;
    summaries: number;
    knowledge: number;
    newsletters: number;
    anomaly: number;
    copilot: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AiUsageSchema = new Schema<AiUsageDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    month: { type: String, required: true },
    creditsUsed: { type: Number, default: 0 },
    creditsLimit: { type: Number, default: 1000 },
    breakdown: {
      type: new Schema({
        triage: { type: Number, default: 0 },
        replies: { type: Number, default: 0 },
        summaries: { type: Number, default: 0 },
        knowledge: { type: Number, default: 0 },
        newsletters: { type: Number, default: 0 },
        anomaly: { type: Number, default: 0 },
        copilot: { type: Number, default: 0 },
      }, { _id: false }),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

AiUsageSchema.index({ tenantId: 1, month: 1 }, { unique: true });

export const AiUsage = mongoose.model<AiUsageDoc>("AiUsage", AiUsageSchema);
