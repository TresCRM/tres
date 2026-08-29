import mongoose, { Schema, Types } from "mongoose";

export type { Role } from "../../../../packages/types/src/roles";
import type { Role } from "../../../../packages/types/src/roles";
import { ROLES } from "../../../../packages/types/src/roles";

export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface UserDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  status: UserStatus;
  emailVerification?: {
    token: string;           // 48-char hex for magic-link flow
    code: string;            // 6-digit numeric code for manual entry
    expiresAt: Date;
    verifiedAt?: Date;
    attempts: number;        // count of failed verification attempts
    lockedUntil?: Date | null; // cooldown after too many failures
  };
  mfa?: {
    secret: string;
    enabled: boolean;
    recoveryCodes: string[];
    verifiedAt?: Date;
  };
  notificationPreferences?: {
    email: {
      ticket_assigned: boolean;
      ticket_replied: boolean;
      ticket_sla_breach: boolean;
      ticket_mentioned: boolean;
      message_received: boolean;
      billing_alerts: boolean;
      weekly_digest: boolean;
    };
  };
  customRoleId?: Types.ObjectId;
  passwordChangedAt?: Date;
  passwordReset?: {
    token: string;
    expiresAt: Date;
  };
  failedLoginAttempts: number;
  lockUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmailVerificationSchema = new Schema({
  token: { type: String, required: true },
  code: { type: String, default: "" },  // 6-digit numeric code; optional for backward compat with legacy records
  expiresAt: { type: Date, required: true },
  verifiedAt: Date,
  attempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
}, { _id: false });

const MfaSchema = new Schema({
  secret: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  recoveryCodes: { type: [String], default: [] },
  verifiedAt: Date,
}, { _id: false });

const UserSchema = new Schema<UserDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  firstName: String,
  lastName: String,
  email: { type: String, required: true },
  passwordHash: { type: String, required: true },
  roles: { type: [String], default: ["AGENT"] },
  status: { type: String, enum: ["PENDING","ACTIVE","DISABLED"], default: "PENDING" },
  emailVerification: EmailVerificationSchema,
  mfa: MfaSchema,
  notificationPreferences: {
    type: {
      email: {
        ticket_assigned: { type: Boolean, default: true },
        ticket_replied: { type: Boolean, default: true },
        ticket_sla_breach: { type: Boolean, default: true },
        ticket_mentioned: { type: Boolean, default: true },
        message_received: { type: Boolean, default: true },
        billing_alerts: { type: Boolean, default: true },
        weekly_digest: { type: Boolean, default: false },
      },
    },
    default: undefined,
  },
  customRoleId: { type: Schema.Types.ObjectId, ref: "CustomRole" },
  passwordChangedAt: Date,
  passwordReset: {
    token: { type: String },
    expiresAt: { type: Date },
  },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// One-tenant-per-owner: the same email cannot own more than one tenant.
// Partial index — only rows where roles contains OWNER participate.
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { roles: "OWNER" }, name: "unique_owner_email" }
);

// PII field-level encryption at rest (activated when FIELD_ENCRYPTION_KEY is set)
import { fieldEncryptionPlugin } from "../utils/fieldEncryption";
UserSchema.plugin(fieldEncryptionPlugin, { fields: ["firstName", "lastName"] });

export const User = mongoose.model<UserDoc>("User", UserSchema);
