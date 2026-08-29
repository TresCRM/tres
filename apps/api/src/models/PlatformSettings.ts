import mongoose, { Schema, Types } from "mongoose";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
}

export interface PlatformSettingsDoc {
  _id: Types.ObjectId;
  key: string;
  maintenanceMode: boolean;
  signupEnabled: boolean;
  defaultPlan: string;
  maxTenantsPerUser: number;
  supportEmail: string;
  platformName: string;
  featureFlags: FeatureFlag[];
  updatedBy: Types.ObjectId | null;
  updatedAt: Date;
}

const PlatformSettingsSchema = new Schema<PlatformSettingsDoc>({
  key: { type: String, default: "global", unique: true },
  maintenanceMode: { type: Boolean, default: false },
  signupEnabled: { type: Boolean, default: true },
  defaultPlan: { type: String, default: "FREE" },
  maxTenantsPerUser: { type: Number, default: 3 },
  supportEmail: { type: String, default: "support@trescrm.com" },
  platformName: { type: String, default: "TRES CRM" },
  featureFlags: {
    type: [{
      key: { type: String, required: true },
      enabled: { type: Boolean, default: false },
      description: { type: String, default: "" },
    }],
    default: [],
  },
  updatedBy: { type: Schema.Types.ObjectId, default: null },
}, { timestamps: true });

export const PlatformSettings = mongoose.model<PlatformSettingsDoc>("PlatformSettings", PlatformSettingsSchema);

/** Get or create the singleton settings document */
export async function getSettings(): Promise<PlatformSettingsDoc> {
  let doc = await PlatformSettings.findOne({ key: "global" });
  if (!doc) {
    doc = await PlatformSettings.create({ key: "global" });
  }
  return doc;
}
