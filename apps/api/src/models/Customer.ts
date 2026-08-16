import mongoose, { Schema, Types } from "mongoose";

export interface CustomerDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  customFields?: Map<string, any>;
  isSandbox?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<CustomerDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  email: { type: String, index: true, required: true },
  phone: String,
  company: String,
  customFields: { type: Map, of: Schema.Types.Mixed, default: undefined },
  isSandbox: { type: Boolean, default: false, index: true },
}, { timestamps: true });

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// PII field-level encryption at rest (activated when FIELD_ENCRYPTION_KEY is set)
import { fieldEncryptionPlugin } from "../utils/fieldEncryption";
CustomerSchema.plugin(fieldEncryptionPlugin, { fields: ["name", "phone"] });

export const Customer = mongoose.model<CustomerDoc>("Customer", CustomerSchema);
