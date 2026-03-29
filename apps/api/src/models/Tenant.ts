import mongoose, { Schema, Types } from "mongoose";

export type Branding = {
  name: string;                // Display name for the tenant
  primaryColor?: string;       // e.g. #1a73e8
  surfaceColor?: string;       // e.g. #f1f3f4
  logoUrl?: string;
  emailFrom?: string;          // default sender
};

export interface TenantDoc {
  _id: Types.ObjectId;
  slug: string;                // human friendly id
  branding: Branding;
  plan: "FREE" | "INDIVIDUAL" | "COMPANY";
  seats: number;               // for COMPANY plans
  isActive: boolean;
  lifetimeTicketCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const BrandingSchema = new Schema<Branding>({
  name: { type: String, required: true },
  primaryColor: String,
  surfaceColor: String,
  logoUrl: String,
  emailFrom: String
}, { _id: false });

const TenantSchema = new Schema<TenantDoc>({
  slug: { type: String, required: true, unique: true, index: true },
  branding: { type: BrandingSchema, required: true },
  plan: { type: String, enum: ["FREE", "INDIVIDUAL", "COMPANY"], required: true },
  seats: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  lifetimeTicketCount: { type: Number, default: 0 }
}, { timestamps: true });

export const Tenant = mongoose.model<TenantDoc>("Tenant", TenantSchema);
