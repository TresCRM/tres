import mongoose, { Schema, Types } from "mongoose";

export type MessageType = "DIRECT" | "CHANNEL" | "TICKET_NOTE";

export interface MessageDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  type: MessageType;
  senderId: Types.ObjectId;
  recipientId?: Types.ObjectId;
  channelName?: string;
  ticketId?: Types.ObjectId;
  content: string;
  mentions: Types.ObjectId[];
  readBy: { userId: Types.ObjectId; readAt: Date }[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<MessageDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    type: { type: String, enum: ["DIRECT", "CHANNEL", "TICKET_NOTE"], required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User" },
    channelName: String,
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    content: { type: String, required: true, maxlength: 5000 },
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ userId: { type: Schema.Types.ObjectId, ref: "User" }, readAt: Date, _id: false }],
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ tenantId: 1, type: 1, senderId: 1, createdAt: -1 });
MessageSchema.index({ tenantId: 1, recipientId: 1, createdAt: -1 });
MessageSchema.index({ tenantId: 1, channelName: 1, createdAt: -1 });
MessageSchema.index({ tenantId: 1, ticketId: 1, createdAt: -1 });

export const Message = mongoose.model<MessageDoc>("Message", MessageSchema);
