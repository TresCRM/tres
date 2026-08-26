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
  /** Set when the provider reports a hard bounce for this address. */
  emailBounced?: boolean;
  emailBouncedAt?: Date;
  bounceReason?: string;
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
  // Bounce suppression. These must be declared: the schema is strict, so an
  // update touching undeclared paths is silently dropped.
  emailBounced: { type: Boolean, default: false, index: true },
  emailBouncedAt: Date,
  bounceReason: String,
}, { timestamps: true });

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// PII field-level encryption at rest (activated when FIELD_ENCRYPTION_KEY is set)
import { fieldEncryptionPlugin } from "../utils/fieldEncryption";
CustomerSchema.plugin(fieldEncryptionPlugin, { fields: ["name", "phone"] });

export const Customer = mongoose.model<CustomerDoc>("Customer", CustomerSchema);
