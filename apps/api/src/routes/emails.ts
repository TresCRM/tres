import { Router } from "express";
import { any, z } from "zod";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { EmailTemplate } from "../models/EmailTemplate";
import { EmailMessage } from "../models/EmailMessage";
import { renderVars } from "../utils/render";
import { sendEmail } from "../services/mailer";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const emailsRouter = Router();

const TemplateBody = z.object({
  key: z.string().min(3),
  name: z.string().min(3),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  isActive: z.boolean().optional()
});

emailsRouter.post("/templates", requireAuth, requirePermission("EMAIL_TEMPLATE_MANAGE"), async (req,res) => {
  const auth = (req as AuthRequest).auth;
  const b = TemplateBody.parse(req.body);
  const doc = await EmailTemplate.findOneAndUpdate(
    { tenantId: asObjectId(auth.tid), key: b.key },
    { ...b, tenantId: asObjectId(auth.tid), updatedAt: new Date() },
    { new: true, upsert: true }
  );
  res.status(201).json({ data: doc });
});

emailsRouter.post("/send", requireAuth, requirePermission("EMAIL_SEND"), async (req,res) => {
  const auth = (req as AuthRequest).auth;
  const schema = z.object({
    to: z.union([z.string(), z.array(z.email())]),
    templateKey: z.string(),
    vars: z.record(z.string(), z.unknown()).default({}),
    messageKey: z.string().optional()
  });
  const b = schema.parse(req.body);
  const tpl = await EmailTemplate.findOne({ tenantId: asObjectId(auth.tid), key: b.templateKey, isActive: true })
            || await EmailTemplate.findOne({ tenantId: null, key: b.templateKey, isActive: true });
  if (!tpl) return res.status(404).json({ error:"not_found", message:"Template not found" });

  // idempotent guard
  if (b.messageKey) {
    const existing = await EmailMessage.findOne({ tenantId: asObjectId(auth.tid), messageKey: b.messageKey });
    if (existing) return res.status(200).json({ data: existing, idempotent: true });
  }

  const subject = renderVars(tpl.subject, b.vars);
  const html = renderVars(tpl.html, b.vars);
  const text = tpl.text ? renderVars(tpl.text, b.vars) : undefined;

  const msg = await EmailMessage.create({
    tenantId: asObjectId(auth.tid),
    to: Array.isArray(b.to) ? b.to : [b.to],
    subject, html, text,
    templateKey: tpl.key,
    messageKey: b.messageKey,
    status: process.env.EMAILS_DISABLED === "1" ? "SKIPPED" : "QUEUED",
    createdAt: new Date()
  });

  // Fire & forget
  (async () => {
    try {
      const result = await sendEmail({ to: msg.to, subject, html, text, messageKey: b.messageKey });
      await EmailMessage.updateOne({ _id: msg._id }, {
        status: result.skipped ? "SKIPPED" : "SENT",
        providerId: result.id,
        updatedAt: new Date()
      });
    } catch (e:any) {
      await EmailMessage.updateOne({ _id: msg._id }, { status:"FAILED", lastError: String(e?.message || e), updatedAt: new Date() });
    }
  })();

  res.status(201).json({ data: msg });
});

/* ---- Swagger (abbrev) ---- */
registry.registerPath({
  tags: ["Mailing"],
  method: "post", path: "/api/v1/emails/templates",
  request: { body: { content: { "application/json": { schema: TemplateBody } } } },
  responses: { 201: { description: "Created" } }
});
registry.registerPath({
  tags: ["Mailing"],
  method: "post", path: "/api/v1/emails/send",
  request: { body: { content: { "application/json": { schema: z.object({
    to: z.union([z.string(), z.array(z.string())]),
    templateKey: z.string(),
    vars: z.record(z.string(), z.unknown()).optional(),
    messageKey: z.string().optional()
  }) } } } },
  responses: { 201: { description: "Queued" } }
});
