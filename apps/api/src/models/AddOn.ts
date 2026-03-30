import mongoose, { Schema, Types } from "mongoose";

export interface AddOnDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  priceCentsMonthly: number;
  description: string;
  entitlementKey: string;
  isActive: boolean;
}

const AddOnSchema = new Schema<AddOnDoc>({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  priceCentsMonthly: { type: Number, required: true },
  description: { type: String, default: "" },
  entitlementKey: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { versionKey: false });

export const AddOn = mongoose.model<AddOnDoc>("AddOn", AddOnSchema);

/** Seed default add-ons per PRD */
export const DEFAULT_ADDONS: Omit<AddOnDoc, "_id">[] = [
  { code: "EXTRA_SEAT", name: "Extra Seat", priceCentsMonthly: 600, description: "Additional user seat", entitlementKey: "extra_seats", isActive: true },
  { code: "SMTP_DOMAIN", name: "Dedicated SMTP Domain", priceCentsMonthly: 2000, description: "Custom sending domain (tenant-alias@yourappmail.com)", entitlementKey: "smtp_domain", isActive: true },
  { code: "PRIORITY_SUPPORT", name: "Priority Support", priceCentsMonthly: 14900, description: "Priority ticket queue and faster SLAs", entitlementKey: "priority_support", isActive: true },
  { code: "SSO_SAML", name: "SSO/SAML", priceCentsMonthly: 9900, description: "Single sign-on via SAML/OAuth", entitlementKey: "sso", isActive: true },
  { code: "PREMIUM_ANALYTICS", name: "Premium Analytics", priceCentsMonthly: 9900, description: "Advanced reporting and analytics dashboard", entitlementKey: "analytics", isActive: true },
];
