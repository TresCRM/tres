import mongoose, { Schema, Types } from "mongoose";

export interface SlaPolicyDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "ALL";
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  breachNotifyAssignee: boolean;
  breachNotifyManager: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SlaPolicySchema = new Schema<SlaPolicyDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL", "ALL"], required: true },
    firstResponseMinutes: { type: Number, required: true },
    resolutionMinutes: { type: Number, required: true },
    businessHoursOnly: { type: Boolean, default: false },
    breachNotifyAssignee: { type: Boolean, default: true },
    breachNotifyManager: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SlaPolicySchema.index({ tenantId: 1, isActive: 1 });
SlaPolicySchema.index({ tenantId: 1, isDefault: 1, priority: 1 });

export const SlaPolicy = mongoose.model<SlaPolicyDoc>("SlaPolicy", SlaPolicySchema);
