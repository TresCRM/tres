import { Router } from "express";
import { z } from "zod";
import * as jwt from "jsonwebtoken";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Survey } from "../models/Survey";
import { SurveyInvite } from "../models/SurveyInvite";
import { SurveyResponse } from "../models/SurveyResponse";
import { registry } from "../docs/swagger";
import { EmailTemplate } from "../models/EmailTemplate";
import { renderVars } from "../utils/render";
import { sendEmail } from "../services/mailer";
import { ENV } from "../config/env";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

const SurveyBody = z.object({
  key: z.string().min(3),
  name: z.string().min(3),
  questions: z.array(z.object({
    key: z.string().min(2),
    label: z.string().min(3),
    type: z.enum(["RATING","NPS","TEXT"]),
    required: z.boolean().optional()
  })).min(1)
});

// --- OpenAPI types for docs (zod) ---
const SurveyQuestionSchema = z.object({
  key: z.string().min(2),
  label: z.string().min(3),
  type: z.enum(["RATING","NPS","TEXT"]),
  required: z.boolean().optional()
});

const SurveySchema = z.object({
  _id: z.string(),
  tenantId: z.string(),
  key: z.string(),
  name: z.string(),
  questions: z.array(SurveyQuestionSchema),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const InviteSendBody = z.object({
  ticketId: z.string(),
  customerEmail: z.email(),
  subject: z.string().optional()
});

const InviteSendResponse = z.object({
  data: z.object({
    inviteId: z.string(),
    inviteUrl: z.url()
  })
});

// --- Register components once ---
registry.register("Survey", SurveySchema);

// --- Register paths ---
// POST /api/v1/surveys (create or update a survey template)
registry.registerPath({
  tags: ["Surveys"],
  method: "post",
  path: "/api/v1/surveys",
  description: "Create or update a survey template for the tenant.",
  request: {
    // optional: document bearer auth header in schemas if you like
    body: { content: { "application/json": { schema: SurveyBody } } }
  },
  responses: {
    201: {
      description: "Created/Updated",
      content: { "application/json": { schema: z.object({ data: SurveySchema }) } }
    },
    400: { description: "Validation error" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" }
  }
});

// POST /api/v1/surveys/{id}/send (send an invite email)
registry.registerPath({
  tags: ["Surveys"],
  method: "post",
  path: "/api/v1/surveys/{id}/send",
  description: "Send a survey invite for a ticket to a customer.",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: InviteSendBody } } }
  },
  responses: {
    201: { description: "Invite created & email queued", content: { "application/json": { schema: InviteSendResponse } } },
    400: { description: "Validation error" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
    404: { description: "Survey not found" }
  }
});

export const surveysRouter = Router();



// Create/update survey template
surveysRouter.post("/", requireAuth, requirePermission("SURVEY_CREATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const b = SurveyBody.parse(req.body);
  const s = await Survey.findOneAndUpdate(
    { tenantId: asObjectId(auth.tid), key: b.key },
    { ...b, tenantId: asObjectId(auth.tid), updatedAt: new Date() },
    { new: true, upsert: true }
  );
  res.status(201).json({ data: s });
});

// Send invite for ticket (returns inviteUrl for convenience)
surveysRouter.post("/:id/send", requireAuth, requirePermission("SURVEY_SEND"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const schema = z.object({
    ticketId: z.string(),
    customerEmail: z.email(),
    subject: z.string().optional()
  });
  const { ticketId, customerEmail, subject } = schema.parse(req.body);

  const survey = await Survey.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid), isActive: true });
  if (!survey) return res.status(404).json({ error:"not_found" });

  const ttlDays = ENV.SURVEY_TOKEN_TTL_DAYS;
  const token = jwt.sign({
    tid: auth.tid,
    sid: String(survey._id),
    tk: ticketId,
    em: customerEmail
  }, ENV.SURVEY_JWT_SECRET, { expiresIn: `${ttlDays}d` });

  const expiresAt = new Date(Date.now() + ttlDays*86400000);
  const invite = await SurveyInvite.create({
    tenantId: asObjectId(auth.tid),
    surveyId: survey._id,
    ticketId: asObjectId(ticketId),
    customerEmail,
    token,
    expiresAt
  });

  // Email it
  const tpl = await EmailTemplate.findOne({ tenantId: asObjectId(auth.tid), key: ENV.SURVEY_DEFAULT_TEMPLATE_KEY })
           || await EmailTemplate.findOne({ tenantId: null, key: ENV.SURVEY_DEFAULT_TEMPLATE_KEY });

  const inviteUrl = `${req.protocol}://${req.get("host")}/public/surveys/${token}`;
  const vars = { survey, inviteUrl, customer: { email: customerEmail } };
  const emailSubject = subject || ENV.SURVEY_DEFAULT_SUBJECT;
  let html = `Please take a quick survey: <a href="${inviteUrl}">Open survey</a>`;
  let text = `Please take a quick survey: ${inviteUrl}`;
  if (tpl) {
    html = renderVars(tpl.html, vars);
    text = tpl.text ? renderVars(tpl.text, vars) : text;
  }
  await sendEmail({ to: customerEmail, subject: emailSubject, html, text, messageKey: `survey_${invite._id}` });

  res.status(201).json({ data: { inviteId: String(invite._id), inviteUrl } });
});

// GET survey responses with pagination
surveysRouter.get("/:id/responses", requireAuth, requirePermission("SURVEY_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;

  const filter: any = { tenantId: asObjectId(auth.tid), surveyId: asObjectId(req.params.id) };
  if (cursor) filter._id = { $lt: asObjectId(cursor) };

  const responses = await SurveyResponse.find(filter).sort({ _id: -1 }).limit(limit).lean();
  const nextCursor = responses.length === limit ? String(responses[responses.length - 1]._id) : undefined;
  res.json({ data: responses, nextCursor });
});

// GET survey analytics (aggregated scores)
surveysRouter.get("/:id/analytics", requireAuth, requirePermission("SURVEY_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const surveyId = asObjectId(req.params.id);
  const tenantId = asObjectId(auth.tid);

  const [stats] = await SurveyResponse.aggregate([
    { $match: { tenantId, surveyId } },
    { $group: {
      _id: null,
      totalResponses: { $sum: 1 },
      avgScore: { $avg: "$overallScore" },
      minScore: { $min: "$overallScore" },
      maxScore: { $max: "$overallScore" },
    }},
  ]);

  // NPS calculation: count promoters (9-10), passives (7-8), detractors (0-6)
  const npsData = await SurveyResponse.aggregate([
    { $match: { tenantId, surveyId, overallScore: { $ne: null } } },
    { $group: {
      _id: null,
      promoters: { $sum: { $cond: [{ $gte: ["$overallScore", 9] }, 1, 0] } },
      passives: { $sum: { $cond: [{ $and: [{ $gte: ["$overallScore", 7] }, { $lt: ["$overallScore", 9] }] }, 1, 0] } },
      detractors: { $sum: { $cond: [{ $lt: ["$overallScore", 7] }, 1, 0] } },
      total: { $sum: 1 },
    }},
  ]);

  const nps = npsData[0]
    ? Math.round(((npsData[0].promoters - npsData[0].detractors) / npsData[0].total) * 100)
    : null;

  res.json({
    data: {
      totalResponses: stats?.totalResponses || 0,
      avgScore: stats?.avgScore ? Math.round(stats.avgScore * 100) / 100 : null,
      minScore: stats?.minScore ?? null,
      maxScore: stats?.maxScore ?? null,
      nps,
    },
  });
});