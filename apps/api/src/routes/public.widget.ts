/**
 * @module routes/public.widget
 * Public widget endpoints for the embeddable support widget.
 * Auth via widget token (pub_xxxx) passed in query/body -- NOT JWT or API key.
 * Domain validation via Origin/Referer header.
 */
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { WidgetToken } from "../models/WidgetToken";
import { WidgetImpression } from "../models/WidgetImpression";
import { Tenant } from "../models/Tenant";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { asObjectId } from "../utils/auth";
import { sanitizeUserHtml } from "../utils/sanitize";
import { emitTicketEvent } from "../events/emitter";
import { sendEmail } from "../services/mailer";
import { ENV } from "../config/env";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const publicWidgetRouter = Router();

/* ---------- Helpers ---------- */

async function resolveWidgetToken(tokenStr: string, origin?: string) {
  const wt = await WidgetToken.findOne({ token: tokenStr, isActive: true }).lean();
  if (!wt) return null;

  // Domain validation (skip if no domains configured or in test mode)
  if (wt.allowedDomains.length > 0 && !ENV.IS_TEST) {
    if (!origin) return null;
    try {
      const originUrl = new URL(origin);
      const allowed = wt.allowedDomains.some(d => {
        try {
          const allowedUrl = new URL(d);
          // Exact hostname match (no prefix/substring bypass)
          return originUrl.hostname === allowedUrl.hostname ||
                 originUrl.hostname.endsWith('.' + allowedUrl.hostname);
        } catch { return false; }
      });
      if (!allowed) return null;
    } catch { return null; }
  }

  return wt;
}

function signTrackingToken(email: string, tid: string, ticketId: string): string {
  return jwt.sign({ email, tid, ticketId, type: "widget_tracking" }, ENV.JWT_SECRET, { expiresIn: "7d" });
}

function verifyTrackingToken(token: string): { email: string; tid: string; ticketId: string } {
  const payload = jwt.verify(token, ENV.JWT_SECRET) as any;
  if (payload.type !== "widget_tracking") throw new Error("Invalid token type");
  return payload;
}

/* ---------- Schemas ---------- */

const CreateTicketBody = z.object({
  widgetToken: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email(),
  subject: z.string().min(3).max(200),
  body: z.string().min(1).max(50000),
});

const ReplyBody = z.object({
  body: z.string().min(1).max(50000),
  trackingToken: z.string().min(1),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({ tags: ["Widget (Public)"], method: "get", path: "/public/widget/config", description: "Get widget configuration and tenant branding.", request: { query: z.object({ token: z.string() }) }, responses: { 200: { description: "OK" }, 401: { description: "Invalid token" } }, security: [] });
registry.registerPath({ tags: ["Widget (Public)"], method: "post", path: "/public/widget/tickets", description: "Create a ticket from the embeddable widget.", request: { body: { content: { "application/json": { schema: CreateTicketBody } } } }, responses: { 201: { description: "Created" }, 401: { description: "Invalid token" } }, security: [] });
registry.registerPath({ tags: ["Widget (Public)"], method: "get", path: "/public/widget/tickets/{id}", description: "Get ticket status and comments via tracking token.", request: { params: z.object({ id: z.string() }), query: z.object({ trackingToken: z.string() }) }, responses: { 200: { description: "OK" } }, security: [] });
registry.registerPath({ tags: ["Widget (Public)"], method: "post", path: "/public/widget/tickets/{id}/reply", description: "Reply to a ticket from the widget.", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: ReplyBody } } } }, responses: { 201: { description: "Reply added" } }, security: [] });

const TrackBody = z.object({
  token: z.string().min(1),
  event: z.enum(["impression", "badge_click", "signup_conversion"]),
  referrerDomain: z.string().max(500).optional(),
});

/* ---------- Routes ---------- */

// POST widget tracking event
publicWidgetRouter.post("/widget/track", async (req, res) => {
  try {
    const body = TrackBody.parse(req.body);
    const origin = req.headers.origin || req.headers.referer;
    const wt = await resolveWidgetToken(body.token, origin as string);
    if (!wt) return res.status(401).json({ error: "invalid_widget_token" });

    await WidgetImpression.create({
      tenantId: wt.tenantId,
      event: body.event,
      referrerDomain: body.referrerDomain,
      timestamp: new Date(),
    });

    return res.status(201).json({ data: { recorded: true } });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET widget config (branding + settings)
publicWidgetRouter.get("/widget/config", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  const origin = req.headers.origin || req.headers.referer;
  const wt = await resolveWidgetToken(tokenStr, origin as string);
  if (!wt) return res.status(401).json({ error: "invalid_widget_token" });

  const tenant = await Tenant.findById(wt.tenantId).select("branding slug").lean();
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

  res.json({
    data: {
      tenant: { slug: tenant.slug, name: tenant.branding.name },
      branding: {
        primaryColor: tenant.branding.primaryColor,
        surfaceColor: tenant.branding.surfaceColor,
        logoUrl: tenant.branding.logoUrl,
      },
      widget: {
        greeting: wt.greeting,
        position: wt.position,
      },
    },
  });
});

// POST create ticket from widget
publicWidgetRouter.post("/widget/tickets", async (req, res) => {
  try {
    const body = CreateTicketBody.parse(req.body);
    const origin = req.headers.origin || req.headers.referer;
    const wt = await resolveWidgetToken(body.widgetToken, origin as string);
    if (!wt) return res.status(401).json({ error: "invalid_widget_token" });

    const ticket = await Ticket.create({
      tenantId: wt.tenantId,
      subject: body.subject,
      body: sanitizeUserHtml(body.body),
      customerEmail: body.email.toLowerCase(),
      priority: "MEDIUM",
      status: "OPEN",
      createdBy: wt.tenantId, // widget has no user
    });

    // Increment lifetime ticket count
    await Tenant.updateOne({ _id: wt.tenantId }, { $inc: { lifetimeTicketCount: 1 } });

    const trackingToken = signTrackingToken(body.email.toLowerCase(), String(wt.tenantId), String(ticket._id));

    // Send confirmation email — best-effort: SMTP failure must not fail the create request.
    if (!ENV.EMAILS_DISABLED) {
      const tenant = await Tenant.findById(wt.tenantId).select("branding slug").lean();
      const slugPart = tenant?.slug ? `&tenant=${encodeURIComponent(tenant.slug)}` : "";
      const trackUrl = `${ENV.FRONTEND_ORIGIN}/portal/tickets/${ticket._id}?token=${encodeURIComponent(trackingToken)}${slugPart}`;
      try {
        await sendEmail({
          to: body.email,
          subject: `Ticket #${ticket._id} received -- ${body.subject}`,
          messageKey: "ticket_created_customer",
          html: `<p>Hi${body.name ? ` ${body.name}` : ""},</p><p>We received your request: <strong>${body.subject}</strong></p><p><a href="${trackUrl}">Track your ticket</a></p><p>${tenant?.branding?.name || "Support"} Team</p>`,
          text: `We received: ${body.subject}. Track: ${trackUrl}`,
        });
      } catch (mailErr: any) {
        console.error("[mail] widget ticket.created customer email failed", {
          provider: process.env.SMTP_PROVIDER || "default",
          to: body.email,
          ticketId: String(ticket._id),
          code: mailErr?.code,
          response: mailErr?.response,
          message: mailErr?.message,
        });
      }
    }

    emitTicketEvent(String(wt.tenantId), { event: "ticket.created", ticketId: String(ticket._id), source: "widget" });

    return res.status(201).json({
      data: {
        ticketId: String(ticket._id),
        subject: ticket.subject,
        status: ticket.status,
      },
      trackingToken: ENV.IS_TEST ? trackingToken : undefined,
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET ticket status + comments via tracking token
publicWidgetRouter.get("/widget/tickets/:id", async (req, res) => {
  const trackingToken = req.query.trackingToken as string;
  if (!trackingToken) return res.status(401).json({ error: "tracking_token_required" });

  try {
    const payload = verifyTrackingToken(trackingToken);
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

    // Verify access: matching tenant and email
    if (String(ticket.tenantId) !== payload.tid) return res.status(403).json({ error: "access_denied" });
    if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) return res.status(403).json({ error: "access_denied" });

    const comments = await Comment.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .select("body isAgent createdAt")
      .lean();

    res.json({
      data: {
        _id: ticket._id,
        subject: ticket.subject,
        body: ticket.body,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        comments,
      },
    });
  } catch {
    return res.status(401).json({ error: "invalid_tracking_token" });
  }
});

// POST reply from widget
publicWidgetRouter.post("/widget/tickets/:id/reply", async (req, res) => {
  try {
    const body = ReplyBody.parse(req.body);
    const payload = verifyTrackingToken(body.trackingToken);

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });
    if (String(ticket.tenantId) !== payload.tid) return res.status(403).json({ error: "access_denied" });
    if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) return res.status(403).json({ error: "access_denied" });
    if (ticket.status === "CLOSED") return res.status(400).json({ error: "ticket_closed" });

    const comment = await Comment.create({
      tenantId: ticket.tenantId,
      ticketId: ticket._id,
      authorId: ticket.tenantId,
      body: sanitizeUserHtml(body.body),
      isAgent: false,
    });

    // Bump ticket so dashboard sort-by-recency surfaces the new activity
    await Ticket.updateOne({ _id: ticket._id }, { $currentDate: { updatedAt: true } });

    emitTicketEvent(String(ticket.tenantId), { event: "ticket.replied", ticketId: String(ticket._id), isAgent: false, source: "widget", customerEmail: ticket.customerEmail });

    return res.status(201).json({ data: { commentId: String(comment._id) } });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") return res.status(401).json({ error: "invalid_tracking_token" });
    return res.status(500).json({ error: "internal_error" });
  }
});
