import mongoose, { Schema, Types } from "mongoose";

export type Branding = {
  name: string;                // Display name for the tenant
  primaryColor?: string;       // e.g. #1a73e8
  surfaceColor?: string;       // e.g. #f1f3f4
  logoUrl?: string;
  emailFrom?: string;          // default sender
};

export type TtlConfig = {
  enabled: boolean;                // default: true
  reminderIntervals: number[];     // hours between reminders, default: [24, 48, 72]
  graceWindowHours: number;        // hours after last reminder before auto-close, default: 24
  applicableStatuses: string[];    // default: ['OPEN', 'AWAITING_CUSTOMER']
  skipIfAgentUpdatedWithinHours: number; // default: 24
};

export interface PortalConfig {
  showAgentName: boolean;
  showSlaTargets: boolean;
  showTransferDetails: boolean;
  allowCustomerPriority: boolean;
  customGreeting?: string;
}

export interface AiFeatures {
  triage: boolean;
  suggestedReplies: boolean;
  summaries: boolean;
  knowledgeExtraction: boolean;
  newsletters: boolean;
  anomalyDetection: boolean;
  copilot: boolean;
}

export interface SsoConfig {
  provider: "saml" | "google" | "microsoft";
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
  ssoRequired: boolean;
  ssoGraceUntil?: Date;
}

export interface TenantDoc {
  _id: Types.ObjectId;
  slug: string;                // human friendly id
  branding: Branding;
  plan: "FREE" | "INDIVIDUAL" | "COMPANY";
  seats: number;               // for COMPANY plans
  isActive: boolean;
  lifetimeTicketCount: number;
  ttlConfig?: TtlConfig;
  subdomain?: string;
  portalConfig?: PortalConfig;
  aiFeatures?: AiFeatures;
  ssoConfig?: SsoConfig;
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

const TtlConfigSchema = new Schema<TtlConfig>({
  enabled: { type: Boolean, default: true },
  reminderIntervals: { type: [Number], default: [24, 48, 72] },
  graceWindowHours: { type: Number, default: 24 },
  applicableStatuses: { type: [String], default: ["OPEN", "AWAITING_CUSTOMER"] },
  skipIfAgentUpdatedWithinHours: { type: Number, default: 24 },
}, { _id: false });

const PortalConfigSchema = new Schema<PortalConfig>({
  showAgentName: { type: Boolean, default: false },
  showSlaTargets: { type: Boolean, default: true },
  showTransferDetails: { type: Boolean, default: true },
  allowCustomerPriority: { type: Boolean, default: false },
  customGreeting: String,
}, { _id: false });

const TenantSchema = new Schema<TenantDoc>({
  slug: { type: String, required: true, unique: true, index: true },
  branding: { type: BrandingSchema, required: true },
  plan: { type: String, enum: ["FREE", "INDIVIDUAL", "COMPANY"], required: true },
  seats: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  lifetimeTicketCount: { type: Number, default: 0 },
  ttlConfig: { type: TtlConfigSchema, default: undefined },
  subdomain: { type: String, unique: true, sparse: true, lowercase: true },
  portalConfig: { type: PortalConfigSchema, default: undefined },
  aiFeatures: {
    type: new Schema<AiFeatures>({
      triage: { type: Boolean, default: true },
      suggestedReplies: { type: Boolean, default: true },
      summaries: { type: Boolean, default: true },
      knowledgeExtraction: { type: Boolean, default: false },
      newsletters: { type: Boolean, default: true },
      anomalyDetection: { type: Boolean, default: true },
      copilot: { type: Boolean, default: true },
    }, { _id: false }),
    default: undefined,
  },
  ssoConfig: {
    type: new Schema<SsoConfig>({
      provider: { type: String, enum: ["saml", "google", "microsoft"] },
      entityId: String,
      ssoUrl: String,
      certificate: String,
      ssoRequired: { type: Boolean, default: false },
      ssoGraceUntil: Date,
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

export const Tenant = mongoose.model<TenantDoc>("Tenant", TenantSchema);
