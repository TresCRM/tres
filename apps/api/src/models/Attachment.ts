import mongoose, { Schema, Types } from "mongoose";

export interface AttachmentDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  ticketId?: Types.ObjectId;
  commentId?: Types.ObjectId;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  scanStatus: "PENDING" | "CLEAN" | "INFECTED";
  scannedAt?: Date;
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
}

const AttachmentSchema = new Schema<AttachmentDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", index: true },
  commentId: { type: Schema.Types.ObjectId, ref: "Comment", index: true },
  url: { type: String, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ["image/png", "image/jpeg", "image/jpg", "application/pdf"] },
  size: { type: Number, required: true },
  checksum: String,
  scanStatus: { type: String, enum: ["PENDING", "CLEAN", "INFECTED"], default: "PENDING" },
  scannedAt: Date,
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

AttachmentSchema.index({ tenantId: 1, ticketId: 1 });
AttachmentSchema.index({ tenantId: 1, createdAt: -1 });

export const Attachment = mongoose.model<AttachmentDoc>("Attachment", AttachmentSchema);
