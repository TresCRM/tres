import { Schema, model } from "mongoose";

const SurveyInviteSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, index: true, required: true },
  surveyId: { type: Schema.Types.ObjectId, index: true, required: true },
  ticketId: { type: Schema.Types.ObjectId, index: true, required: true },
  customerEmail: { type: String, index: true, required: true },
  token: { type: String, unique: true, required: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export const SurveyInvite = model("SurveyInvite", SurveyInviteSchema, "survey_invites");
