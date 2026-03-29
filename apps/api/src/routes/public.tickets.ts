/**
 * @module routes/public.tickets
 * Public ticket endpoints for end-customers (CUSTOMER role).
 * Auth via short-lived magic link tokens (JWT) sent to customer email.
 * Mounted at /public/tickets
 */
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Tenant } from "../models/Tenant";
import { asObjectId } from "../utils/auth";
import { sanitizeUserHtml } from "../utils/sanitize";
import { sendEmail } from "../services/mailer";
import { ENV } from "../config/env";
import { emitTicketEvent } from "../events/emitter";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../docs/swagger";

extendZodWithOpenApi(z);

export const publicTicketsRouter = Router();

const CUSTOMER_TOKEN_SECRET = ENV.JWT_SECRET;
const CUSTOMER_TOKEN_TTL = "7d";

interface CustomerTokenPayload {
  email: string;
  tid: string;
  ticketId?: string;
  type: "customer_access";
}

function signCustomerToken(payload: Omit<CustomerTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "customer_access" }, CUSTOMER_TOKEN_SECRET, { expiresIn: CUSTOMER_TOKEN_TTL });
}

function verifyCustomerToken(token: string): CustomerTokenPayload {
  const payload = jwt.verify(token, CUSTOMER_TOKEN_SECRET) as any;
  if (payload.type !== "customer_access") throw new Error("Invalid token type");
  return payload;
}

// --- Schemas ---

const CreateTicketBody = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(1).max(50000),
  customerEmail: z.string().email(),
  customerName: z.string().min(1).max(100).optional(),
  tenantSlug: z.string().min(1),
});

const ReplyBody = z.object({
  body: z.string().min(1).max(50000),
});

// --- OpenAPI registrations ---

registry.registerPath({
  tags: ["Tickets (Public/Customer)"],
  method: "post",
  path: "/public/tickets",
  description: "Submit a new support ticket as an end-customer. A magic link will be emailed for tracking.",
  request: {
    body: { content: { "application/json": { schema: CreateTicketBody } } },
  },
  responses: {
    201: { description: "Ticket created" },
    404: { description: "Tenant not found" },
  },
  security: [],
});

registry.registerPath({
  tags: ["Tickets (Public/Customer)"],
  method: "get",
  path: "/public/tickets/{id}",
  description: "View a ticket and its comments using a customer access token.",
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ token: z.string() }),
  },
  responses: {
    200: { description: "OK" },
    401: { description: "Invalid or expired token" },
    403: { description: "Access denied" },
    404: { description: "Ticket not found" },
  },
  security: [],
});

registry.registerPath({
  tags: ["Tickets (Public/Customer)"],
  method: "post",
  path: "/public/tickets/{id}/reply",
  description: "Reply to a ticket as a customer using a magic link token.",
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ token: z.string() }),
    body: { content: { "application/json": { schema: ReplyBody } } },
  },
  responses: {
    201: { description: "Reply added" },
    401: { description: "Invalid token" },
    403: { description: "Access denied" },
    404: { description: "Ticket not found" },
  },
  security: [],
});

// --- Routes ---

/**
 * POST /public/tickets -- submit a new ticket as an end-customer.
 * Creates the ticket, sends a magic link email for tracking/replying.
 */
publicTicketsRouter.post("/tickets", async (req, res) => {
  try {
    const body = CreateTicketBody.parse(req.body);

    const tenant = await Tenant.findOne({ slug: body.tenantSlug.toLowerCase(), isActive: true });
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const ticket = await Ticket.create({
      tenantId: tenant._id,
      subject: body.subject,
      body: sanitizeUserHtml(body.body),
      customerEmail: body.customerEmail.toLowerCase(),
      priority: "MEDIUM",
      status: "ACTIVE",
      createdBy: tenant._id, // tenant as placeholder; no user ID for public submissions
    });

    // Generate magic link token for this customer + ticket
    const token = signCustomerToken({
      email: body.customerEmail.toLowerCase(),
      tid: String(tenant._id),
      ticketId: String(ticket._id),
    });

    const trackingUrl = `${ENV.FRONTEND_ORIGIN}/track-ticket?token=${encodeURIComponent(token)}`;

    // Send confirmation email with tracking link
    if (!ENV.EMAILS_DISABLED) {
      await sendEmail({
        to: body.customerEmail,
        subject: `Ticket #${ticket._id} received -- ${body.subject}`,
        html: [
          `<p>Hi${body.customerName ? ` ${body.customerName}` : ""},</p>`,
          `<p>We received your support request: <strong>${body.subject}</strong></p>`,
          `<p>You can track your ticket and reply using this link:</p>`,
          `<p><a href="${trackingUrl}">View Ticket</a></p>`,
          `<p>This link expires in 7 days. If you need a new one, submit your email on our support page.</p>`,
          `<p>${tenant.branding.name} Support</p>`,
        ].join("\n"),
        text: `We received your request: ${body.subject}. Track it here: ${trackingUrl}`,
      });
    }

    void emitTicketEvent(String(tenant._id), {
      event: "ticket.created",
      ticketId: String(ticket._id),
      customerEmail: body.customerEmail,
    });

    return res.status(201).json({
      data: {
        ticketId: String(ticket._id),
        subject: ticket.subject,
        status: ticket.status,
        trackingUrl: ENV.IS_TEST ? trackingUrl : undefined, // only expose in test for verification
      },
      message: "Ticket created. Check your email for a tracking link.",
    });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /public/tickets/:id?token=<jwt> -- view ticket + comments as a customer.
 */
publicTicketsRouter.get("/tickets/:id", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

    // Verify the token grants access to this ticket's tenant and email
    if (String(ticket.tenantId) !== payload.tid) {
      return res.status(403).json({ error: "access_denied" });
    }
    if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) {
      return res.status(403).json({ error: "access_denied" });
    }

    const comments = await Comment.find({ ticketId: ticket._id })
      .sort({ createdAt: 1 })
      .select("body isAgent createdAt")
      .lean();

    return res.json({
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
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
});

/**
 * POST /public/tickets/:id/reply?token=<jwt> -- reply to a ticket as a customer.
 */
publicTicketsRouter.post("/tickets/:id/reply", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    const body = ReplyBody.parse(req.body);

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

    if (String(ticket.tenantId) !== payload.tid) {
      return res.status(403).json({ error: "access_denied" });
    }
    if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) {
      return res.status(403).json({ error: "access_denied" });
    }
    if (ticket.status === "CLOSED") {
      return res.status(400).json({ error: "ticket_closed", message: "Cannot reply to a closed ticket" });
    }

    const comment = await Comment.create({
      tenantId: ticket.tenantId,
      ticketId: ticket._id,
      authorId: ticket.tenantId, // placeholder for customer (no user ID)
      body: sanitizeUserHtml(body.body),
      isAgent: false,
    });

    void emitTicketEvent(String(ticket.tenantId), {
      event: "ticket.replied",
      ticketId: String(ticket._id),
      isAgent: false,
      customerEmail: payload.email,
    });

    return res.status(201).json({ data: { commentId: String(comment._id) } });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "invalid_or_expired_token" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /public/tickets/request-access -- request a new magic link for an existing ticket.
 * Customer provides email + ticket ID, and a fresh token is emailed.
 */
publicTicketsRouter.post("/tickets/request-access", async (req, res) => {
  try {
    const body = z.object({
      email: z.string().email(),
      ticketId: z.string().min(1),
      tenantSlug: z.string().min(1),
    }).parse(req.body);

    const tenant = await Tenant.findOne({ slug: body.tenantSlug.toLowerCase() });
    if (!tenant) return res.status(200).json({ ok: true }); // don't leak tenant existence

    const ticket = await Ticket.findOne({
      _id: asObjectId(body.ticketId),
      tenantId: tenant._id,
      customerEmail: body.email.toLowerCase(),
    });

    if (!ticket) return res.status(200).json({ ok: true }); // don't leak ticket existence

    const token = signCustomerToken({
      email: body.email.toLowerCase(),
      tid: String(tenant._id),
      ticketId: String(ticket._id),
    });

    const trackingUrl = `${ENV.FRONTEND_ORIGIN}/track-ticket?token=${encodeURIComponent(token)}`;

    if (!ENV.EMAILS_DISABLED) {
      await sendEmail({
        to: body.email,
        subject: `Access link for ticket #${ticket._id}`,
        html: `<p>Here is your tracking link: <a href="${trackingUrl}">View Ticket</a></p>`,
        text: `Track your ticket: ${trackingUrl}`,
      });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true }); // always 200 to prevent enumeration
  }
});
