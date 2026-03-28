import { Schema, model } from "mongoose";

const EmailMessageSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: false },
  to: { type: [String], required: true },
  subject: { type: String, required: true },
  html: { type: String },
  text: { type: String },
  templateKey: { type: String, index: true },
  messageKey: { type: String, index: true },
  status: { type: String, enum: ["QUEUED","SENT","FAILED","SKIPPED"], default: "QUEUED", index: true },
  providerId: { type: String },
  lastError: { type: String },
  headers: { type: Object },
  meta: { type: Object },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

EmailMessageSchema.index({
  tenantId: 1, 
  messageKey: 1 
}, { unique: true, partialFilterExpression: { messageKey: { $type: "string" } } });

export const EmailMessage = model("EmailMessage", EmailMessageSchema, "email_messages");
