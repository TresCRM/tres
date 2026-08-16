import mongoose, { Schema, Types } from "mongoose";

/**
 * Plan override document. The canonical plan catalog lives in `billing/plans.ts`
 * as `PLANS`. This collection stores admin-authored overrides that take precedence
 * at runtime (e.g. price changes, feature toggles, seasonal promotions).
 *
 * An override document matches a PLANS entry by `code`. If no override exists for
 * a code, the hardcoded PLANS entry is used as-is.
 *
 * Legacy fields (priceMonthly) retained for backward compatibility with older
 * code that reads from the Plan collection directly.
 */
export interface PlanDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  tagline?: string;
  seats: number;
  priceCentsPerSeat: number;
  priceCentsMonthly: number;
  priceMonthly?: number;  // legacy alias
  active: boolean;
  isCustom?: boolean;
  isLegacy?: boolean;
  entitlements: {
    sso?: boolean;
    analytics?: boolean;
    api?: boolean;
    realtime?: boolean;
    liveChat?: boolean;
    videoCalls?: boolean;
    aiFeatures?: boolean;
    customSubdomain?: boolean;
    brandedPortal?: boolean;
    customFields?: boolean;
    slaPolicies?: boolean;
    internalMessaging?: boolean;
    prioritySupport?: boolean;
    seats?: number;
    maxSeats?: number;
    ticketLimit?: number | null;
    aiCreditsMonthly?: number;
    videoMinutesMonthly?: number;
  };
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<PlanDoc>({
  code: { type: String, unique: true, required: true, index: true },
  name: { type: String, required: true },
  tagline: String,
  seats: { type: Number, required: true, default: 1 },
  priceCentsPerSeat: { type: Number, default: 0 },
  priceCentsMonthly: { type: Number, default: 0 },
  priceMonthly: Number,
  active: { type: Boolean, default: true },
  isCustom: { type: Boolean, default: false },
  isLegacy: { type: Boolean, default: false },
  entitlements: {
    sso: Boolean,
    analytics: Boolean,
    api: Boolean,
    realtime: Boolean,
    liveChat: Boolean,
    videoCalls: Boolean,
    aiFeatures: Boolean,
    customSubdomain: Boolean,
    brandedPortal: Boolean,
    customFields: Boolean,
    slaPolicies: Boolean,
    internalMessaging: Boolean,
    prioritySupport: Boolean,
    seats: Number,
    maxSeats: Number,
    ticketLimit: { type: Schema.Types.Mixed, default: null },
    aiCreditsMonthly: Number,
    videoMinutesMonthly: Number,
  },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export const Plan = mongoose.model<PlanDoc>("Plan", PlanSchema);
