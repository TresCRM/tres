import { Schema, model } from "mongoose";

const Question = new Schema({
  key: { type: String, required: true },       // e.g. "satisfaction"
  label: { type: String, required: true },     // "How satisfied are you?"
  type: { type: String, enum: ["RATING","NPS","TEXT"], required: true },
  required: { type: Boolean, default: true }
}, { _id: false });

const SurveySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },       // e.g. "ticket_closure_csat"
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  questions: { type: [Question], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

SurveySchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const Survey = model("Survey", SurveySchema, "surveys");