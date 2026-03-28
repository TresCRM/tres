import { Router } from "express";
import { z } from "zod";
import * as jwt from "jsonwebtoken";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { asObjectId } from "../utils/auth";
import { Survey } from "../models/Survey";
import { SurveyInvite } from "../models/SurveyInvite";
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
surveysRouter.post("/", requireAuth, requireRoles("OWNER","ADMIN"), async (req, res) => {
  const auth = (req as any).auth as { tid: string };
  const b = SurveyBody.parse(req.body);
  const s = await Survey.findOneAndUpdate(
    { tenantId: asObjectId(auth.tid), key: b.key },
    { ...b, tenantId: asObjectId(auth.tid), updatedAt: new Date() },
    { new: true, upsert: true }
  );
  res.status(201).json({ data: s });
});

// Send invite for ticket (returns inviteUrl for convenience)
surveysRouter.post("/:id/send", requireAuth, requireRoles("OWNER","ADMIN","AGENT"), async (req, res) => {
  const auth = (req as any).auth as { tid: string };
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