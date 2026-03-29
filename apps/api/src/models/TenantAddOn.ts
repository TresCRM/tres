import mongoose, { Schema, Types } from "mongoose";

export interface TenantAddOnDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  addOnCode: string;
  quantity: number;
  activatedAt: Date;
  canceledAt?: Date;
}

const TenantAddOnSchema = new Schema<TenantAddOnDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  addOnCode: { type: String, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  activatedAt: { type: Date, default: Date.now },
  canceledAt: Date,
}, { versionKey: false });

TenantAddOnSchema.index({ tenantId: 1, addOnCode: 1 }, { unique: true });

export const TenantAddOn = mongoose.model<TenantAddOnDoc>("TenantAddOn", TenantAddOnSchema);
