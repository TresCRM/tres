import mongoose, { Schema, Types } from "mongoose";

export type PartnerApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PartnerTier = "STANDARD" | "PREMIUM";

export interface PartnerApplicationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  companyName: string;
  website?: string;
  description?: string;
  status: PartnerApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  tier: PartnerTier;
  revenueSharePercent: number;
  managedTenantIds: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerApplicationSchema = new Schema<PartnerApplicationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    companyName: { type: String, required: true },
    website: String,
    description: String,
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

PartnerApplicationSchema.index({ userId: 1 }, { unique: true });
PartnerApplicationSchema.index({ tenantId: 1 });
PartnerApplicationSchema.index({ status: 1 });

const PartnerSchema = new Schema<PartnerDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tier: { type: String, enum: ["STANDARD", "PREMIUM"], default: "STANDARD" },
    revenueSharePercent: { type: Number, default: 10 },
    managedTenantIds: { type: [Schema.Types.ObjectId], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PartnerSchema.index({ userId: 1 }, { unique: true });
PartnerSchema.index({ tenantId: 1 });
PartnerSchema.index({ isActive: 1 });

export const PartnerApplication = mongoose.model<PartnerApplicationDoc>(
  "PartnerApplication",
  PartnerApplicationSchema
);
export const Partner = mongoose.model<PartnerDoc>("Partner", PartnerSchema);
