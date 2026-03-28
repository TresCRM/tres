import { Schema, model } from "mongoose";

const EmailTemplateSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: false }, // null => global
  key: { type: String, required: true }, // e.g. "survey.ticket_closed"
  name: { type: String, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  text: { type: String, required: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

EmailTemplateSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const EmailTemplate = model("EmailTemplate", EmailTemplateSchema, "email_templates");