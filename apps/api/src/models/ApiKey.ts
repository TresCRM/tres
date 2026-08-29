import mongoose, { Schema, Types } from "mongoose";

export interface ApiKeyDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  environment: "sandbox" | "production";
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const ApiKeySchema = new Schema<ApiKeyDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true, maxlength: 100 },
  prefix: { type: String, required: true, maxlength: 16 },
  keyHash: { type: String, required: true, unique: true },
  scopes: { type: [String], default: ["tickets:read", "tickets:write"] },
  environment: { type: String, enum: ["sandbox", "production"], default: "production" },
  isActive: { type: Boolean, default: true },
  lastUsedAt: Date,
  expiresAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

ApiKeySchema.index({ tenantId: 1, isActive: 1 });
ApiKeySchema.index({ prefix: 1 });

export const ApiKey = mongoose.model<ApiKeyDoc>("ApiKey", ApiKeySchema);
