import mongoose, { Schema, Types } from "mongoose";

/**
 * A pending second-factor challenge, issued by /auth/login and consumed by
 * /auth/mfa-verify.
 *
 * Persisted rather than held in process memory: the challenge sits between two
 * requests, which a load balancer is free to send to different replicas, and a
 * deploy in that window would otherwise strand the user at a login screen with
 * a ticket nothing recognises.
 *
 * The ticket itself is never stored. It is a bearer credential for the second
 * factor, so only its SHA-256 is kept — a read of this collection yields
 * nothing usable, exactly as for a password or session token.
 */
export interface MfaChallengeDoc {
  _id: Types.ObjectId;
  /** SHA-256 of the ticket handed to the client. */
  ticketHash: string;
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  email: string;
  /** SHA-256 of the requesting client's IP + User-Agent. */
  clientBinding: string;
  /** Failed code submissions so far; the challenge is dropped past the cap. */
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const MfaChallengeSchema = new Schema<MfaChallengeDoc>(
  {
    ticketHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    email: { type: String, required: true },
    clientBinding: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Mongo sweeps expired documents roughly once a minute, so this bounds storage
// but is not a precise deadline — callers must still compare expiresAt.
MfaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MfaChallenge = mongoose.model<MfaChallengeDoc>(
  "MfaChallenge",
  MfaChallengeSchema
);
