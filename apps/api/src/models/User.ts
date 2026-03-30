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
    token: string;
    expiresAt: Date;
    verifiedAt?: Date;
  };
  failedLoginAttempts: number;
  lockUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmailVerificationSchema = new Schema({
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: Date
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
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = mongoose.model<UserDoc>("User", UserSchema);
