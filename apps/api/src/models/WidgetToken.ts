import mongoose, { Schema, Types } from "mongoose";

export interface WidgetTokenDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  token: string;
  allowedDomains: string[];
  isActive: boolean;
  greeting: string;
  position: "bottom-right" | "bottom-left";
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WidgetTokenSchema = new Schema<WidgetTokenDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  token: { type: String, required: true, unique: true },
  allowedDomains: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  greeting: { type: String, default: "Hi! How can we help?" },
  position: { type: String, enum: ["bottom-right", "bottom-left"], default: "bottom-right" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

WidgetTokenSchema.index({ tenantId: 1 });

export const WidgetToken = mongoose.model<WidgetTokenDoc>("WidgetToken", WidgetTokenSchema);
