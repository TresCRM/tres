import { Schema, model } from "mongoose";

const Answer = new Schema({
  key: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true } // number | string
}, { _id: false });

const SurveyResponseSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, index: true, required: true },
  surveyId: { type: Schema.Types.ObjectId, index: true, required: true },
  ticketId: { type: Schema.Types.ObjectId, index: true, required: true },
  customerEmail: { type: String, index: true, required: true },
  answers: { type: [Answer], default: [] },
  overallScore: { type: Number, index: true }, // optional derived (CSAT/NPS)
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export const SurveyResponse = model("SurveyResponse", SurveyResponseSchema, "survey_responses");
