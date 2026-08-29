import { Schema, model, Types } from "mongoose";

export type SubscriptionStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE"
  | "EXPIRED"
  | "CANCELED";

// If you want to keep it open like Schema.Types.Mixed:
export type Entitlements = Record<string, unknown>;

export interface SubscriptionDoc {
  _id: Types.ObjectId; tenantId: Types.ObjectId; planCode: string;
  status: SubscriptionStatus;
  interval: any;
  currentPeriodEnd: Date; 
  seats: number;
  currentPeriodStart: Date;
  graceUntil: Date | null;
  canceledAt: Date | null;
  provider: "manual" | string;
  lastPaymentAt: Date | null;
  failedPaymentCount: number;
  nextRetryAt: Date | null;
  autoRenew: boolean;
  paystackCustomerCode: string | null;
  paystackSubscriptionCode: string | null;
  entitlements: Entitlements;
  createdAt: Date; 
  updatedAt: Date;
}



const SubscriptionSchema = new Schema<SubscriptionDoc>({
  tenantId: { type: Schema.Types.ObjectId, required: true},

  // catalog selection
  planCode: { type: String, index: true, required: true }, // e.g., CO-20
  interval: { type: String, enum:["MONTH","QUARTER","SEMIANNUAL","ANNUAL"], default:"MONTH" },
  seats: { type: Number, default: 1 },

  // lifecycle
  status: { type: String, enum: ["ACTIVE","PAST_DUE","GRACE","EXPIRED","CANCELED"], default: "ACTIVE"},
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd:   { type: Date, required: true },     // end of paid period
  graceUntil:         { type: Date, default: null, index: true }, // end of grace (if any)
  canceledAt:         { type: Date, default: null },

  // billing meta
  provider: { type: String, default: "manual" },  // "manual" | "paystack"
  lastPaymentAt: { type: Date, default: null },
  failedPaymentCount: { type: Number, default: 0 },
  nextRetryAt: { type: Date, default: null },      // next payment retry time (exponential backoff)
  autoRenew: { type: Boolean, default: true },

  // Paystack integration (null when provider=manual)
  paystackCustomerCode: { type: String, default: null, sparse: true },
  paystackSubscriptionCode: { type: String, default: null, sparse: true },

  // entitlements snapshot for fast checks
  entitlements: { type: Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false, timestamps: true });

SubscriptionSchema.index({ status:1 });
SubscriptionSchema.index({ tenantId: 1 }, { unique: true });

export const Subscription = model("Subscription", SubscriptionSchema, "subscriptions");

