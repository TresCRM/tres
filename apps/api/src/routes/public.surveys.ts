import { Router } from "express";
import * as jwt from "jsonwebtoken";
import { z } from "zod";
import { SurveyInvite } from "../models/SurveyInvite";
import { Survey } from "../models/Survey";
import { SurveyResponse } from "../models/SurveyResponse";
import { asObjectId } from "../utils/auth";
import { ENV } from "../config/env";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../docs/swagger";
extendZodWithOpenApi(z);

// For docs: response of GET /public/surveys/{token}
const PublicSurveySchema = z.object({
  data: z.object({
    name: z.string(),
    questions: z.array(z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(["RATING","NPS","TEXT"]),
      required: z.boolean().optional()
    }))
  })
});

// For docs: request body of POST /public/surveys/{token}/submit
const PublicSubmitBody = z.object({
  answers: z.array(z.object({
    key: z.string(),
    value: z.union([z.string(), z.number()])
  }))
});

// GET public survey by token
registry.registerPath({
  tags: ["Surveys (Public)"],
  method: "get",
  path: "/public/surveys/{token}",
  description: "Fetch a public survey by invite token.",
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: PublicSurveySchema } } },
    400: { description: "Invalid token" },
    404: { description: "Survey not found" },
    410: { description: "Invite expired/used" }
  }
});

// POST submit public survey answers
registry.registerPath({
  tags: ["Surveys (Public)"],
  method: "post",
  path: "/public/surveys/{token}/submit",
  description: "Submit answers for a public survey using the invite token.",
  request: {
    params: z.object({ token: z.string() }),
    body: { content: { "application/json": { schema: PublicSubmitBody } } }
  },
  responses: {
    201: { description: "Submitted" },
    400: { description: "Invalid token/body" },
    410: { description: "Invite expired/used" }
  }
});
export const publicSurveysRouter = Router();

publicSurveysRouter.get("/surveys/:token", async (req, res) => {
  const token = req.params.token;
  try {
    const payload = jwt.verify(token, ENV.SURVEY_JWT_SECRET) as any;
    const inv = await SurveyInvite.findOne({ token });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) return res.status(410).json({ error:"gone" });
    const survey = await Survey.findOne({ _id: asObjectId(payload.sid), tenantId: asObjectId(payload.tid) }).lean();
    if (!survey) return res.status(404).json({ error:"not_found" });
    res.json({ data: { name: survey.name, questions: survey.questions } });
  } catch {
    return res.status(400).json({ error:"invalid_token" });
  }
});

publicSurveysRouter.post("/surveys/:token/submit", async (req, res) => {
  const token = req.params.token;
  const body = z.object({
    answers: z.array(z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }))
  }).parse(req.body);

  try {
    const payload = jwt.verify(token, ENV.SURVEY_JWT_SECRET) as any;
    const inv = await SurveyInvite.findOne({ token });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) return res.status(410).json({ error:"gone" });

    // derive score (simple CSAT: average numeric answers 1..5)
    const numeric = body.answers.map(a => (typeof a.value === "number" ? a.value : NaN)).filter(n => !Number.isNaN(n));
    const score = numeric.length ? (numeric.reduce((a,b)=>a+b,0) / numeric.length) : undefined;

    await SurveyResponse.create({
      tenantId: inv.tenantId,
      surveyId: inv.surveyId,
      ticketId: inv.ticketId,
      customerEmail: inv.customerEmail,
      answers: body.answers,
      overallScore: score
    });

    await SurveyInvite.updateOne({ _id: inv._id }, { usedAt: new Date() });
    res.status(201).json({ ok: true });
  } catch {
    return res.status(400).json({ error:"invalid_token" });
  }
});
