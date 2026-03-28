import mongoose, { Schema, Types } from "mongoose";

export interface CustomerDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<CustomerDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  email: { type: String, index: true, required: true },
  phone: String,
  company: String
}, { timestamps: true });

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const Customer = mongoose.model<CustomerDoc>("Customer", CustomerSchema);
