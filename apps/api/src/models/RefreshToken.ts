import mongoose, { Schema, Types } from "mongoose";

export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  tokenHash: string;
  deviceInfo?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<RefreshTokenDoc>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  deviceInfo: String,
  ip: String,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshToken = mongoose.model<RefreshTokenDoc>("RefreshToken", RefreshTokenSchema);
