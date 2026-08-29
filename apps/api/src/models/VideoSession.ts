/**
 * @module models/VideoSession
 * Tracks video call sessions between agents and customers.
 * Used for in-app video support tied to tickets or chat sessions.
 */
import mongoose, { Schema, Types } from "mongoose";

export interface VideoSessionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  ticketId?: Types.ObjectId;
  chatSessionId?: Types.ObjectId;
  agentId: Types.ObjectId;
  customerId?: string;
  status: "INITIATED" | "RINGING" | "ACTIVE" | "ENDED";
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // seconds
  consentGiven: boolean;
  screenShareUsed: boolean;
  createdAt: Date;
}

const VideoSessionSchema = new Schema<VideoSessionDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, ref: "Tenant" },
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    chatSessionId: { type: Schema.Types.ObjectId, ref: "ChatSession" },
    agentId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    customerId: String,
    status: {
      type: String,
      enum: ["INITIATED", "RINGING", "ACTIVE", "ENDED"],
      default: "INITIATED",
    },
    startedAt: Date,
    endedAt: Date,
    duration: Number,
    consentGiven: { type: Boolean, default: false },
    screenShareUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

VideoSessionSchema.index({ tenantId: 1, status: 1 });
VideoSessionSchema.index({ tenantId: 1, agentId: 1 });

export const VideoSession = mongoose.model<VideoSessionDoc>(
  "VideoSession",
  VideoSessionSchema
);
