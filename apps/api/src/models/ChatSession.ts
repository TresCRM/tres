import mongoose, { Schema, Types } from "mongoose";

export type ChatStatus = "QUEUED" | "ACTIVE" | "TRANSFERRED" | "ENDED";

export interface ChatMessageEntry {
  sender: "visitor" | "agent" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatSessionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  visitorId: string;
  visitorName: string;
  visitorEmail?: string;
  agentId?: Types.ObjectId;
  status: ChatStatus;
  messages: ChatMessageEntry[];
  startedAt: Date;
  endedAt?: Date;
  ticketId?: Types.ObjectId;
  metadata?: { userAgent?: string; referrerUrl?: string; pageUrl?: string };
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<ChatMessageEntry>(
  {
    sender: { type: String, enum: ["visitor", "agent", "system"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChatSessionSchema = new Schema<ChatSessionDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    visitorId: { type: String, required: true },
    visitorName: { type: String, required: true },
    visitorEmail: String,
    agentId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["QUEUED", "ACTIVE", "TRANSFERRED", "ENDED"], default: "QUEUED" },
    messages: { type: [ChatMessageSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    metadata: {
      userAgent: String,
      referrerUrl: String,
      pageUrl: String,
    },
  },
  { timestamps: true }
);

ChatSessionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ChatSessionSchema.index({ tenantId: 1, agentId: 1, status: 1 });
ChatSessionSchema.index({ tenantId: 1, visitorId: 1 });

export const ChatSession = mongoose.model<ChatSessionDoc>("ChatSession", ChatSessionSchema);
