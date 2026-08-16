import mongoose, { Schema, Types } from "mongoose";

export interface CustomRoleDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  permissions: string[];
  inheritsFrom?: string; // base canonical role
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomRoleSchema = new Schema<CustomRoleDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  description: String,
  permissions: { type: [String], default: [] },
  inheritsFrom: String,
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

CustomRoleSchema.index({ tenantId: 1, isActive: 1 });
CustomRoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const CustomRole = mongoose.model<CustomRoleDoc>("CustomRole", CustomRoleSchema);
