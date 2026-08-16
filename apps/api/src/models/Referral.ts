import mongoose, { Schema, Types } from "mongoose";

export type ReferralStatus = "PENDING" | "SIGNED_UP" | "ACTIVATED" | "REWARDED" | "EXPIRED";

export interface ReferralDoc {
  _id: Types.ObjectId;
  referrerId: Types.ObjectId;
  referrerTenantId: Types.ObjectId;
  referralCode: string;
  referredTenantId?: Types.ObjectId;
  referredEmail?: string;
  status: ReferralStatus;
  rewardType: string;
  referrerRewarded: boolean;
  referredRewarded: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema = new Schema<ReferralDoc>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    referrerTenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    referralCode: { type: String, required: true, unique: true },
    referredTenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
    referredEmail: { type: String },
    status: {
      type: String,
      enum: ["PENDING", "SIGNED_UP", "ACTIVATED", "REWARDED", "EXPIRED"],
      default: "PENDING",
    },
    rewardType: { type: String, default: "CREDIT" },
    referrerRewarded: { type: Boolean, default: false },
    referredRewarded: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

ReferralSchema.index({ referralCode: 1 }, { unique: true });
ReferralSchema.index({ referrerId: 1, status: 1 });
ReferralSchema.index({ referrerTenantId: 1 });
ReferralSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Referral = mongoose.model<ReferralDoc>("Referral", ReferralSchema);
