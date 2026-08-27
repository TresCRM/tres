/**
 * @module routes/public.tickets
 * Public ticket endpoints for end-customers (CUSTOMER role).
 * Auth via short-lived magic link tokens (JWT) sent to customer email.
 * Mounted at /public/tickets
 */
import { Router } from "express";
import { publicTicketIpLimiter, publicTicketEmailLimiter } from "../middlewares/security";
import { z } from "zod";
import multer from "multer";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Tenant } from "../models/Tenant";
import { Attachment } from "../models/Attachment";
import { Customer } from "../models/Customer";
import { asObjectId } from "../utils/auth";
import { sanitizeUserHtml } from "../utils/sanitize";
import { sendEmail } from "../services/mailer";
import { storeFile, isAllowedMimeType } from "../services/storage";
import { scanAttachment } from "../services/scanner";
import { ENV } from "../config/env";
import { emitTicketEvent } from "../events/emitter";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../docs/swagger";
import {
  signCustomerToken,
  signPortalToken,
  verifyCustomerToken,
  buildTicketTrackingUrl,
} from "../utils/customerToken";

extendZodWithOpenApi(z);

export const publicTicketsRouter = Router();

// Multer: memory storage, 10 MB limit, PRD types only (png/jpeg/pdf)
const publicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}. Allowed: png, jpeg, jpg, pdf`));
  },
});


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
publicTicketsRouter.post(
  "/tickets",
  publicTicketIpLimiter,
  publicTicketEmailLimiter,
  async (req, res) => {
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
      status: "OPEN",
      createdBy: tenant._id, // tenant as placeholder; no user ID for public submissions
    });

    // Generate magic link token for this customer + ticket
    const token = signCustomerToken({
      email: body.customerEmail.toLowerCase(),
      tid: String(tenant._id),
      ticketId: String(ticket._id),
    });

    const trackingUrl = buildTicketTrackingUrl(String(ticket._id), token, tenant.slug);

    // Send confirmation email with tracking link — best-effort: don't 500 if SMTP fails.
    if (!ENV.EMAILS_DISABLED) {
      try {
        await sendEmail({
          to: body.customerEmail,
          subject: `Ticket #${ticket._id} received -- ${body.subject}`,
          messageKey: "ticket_created_customer",
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
      } catch (mailErr: any) {
        console.error("[mail] ticket.created customer email failed", {
          provider: process.env.SMTP_PROVIDER || "default",
          to: body.customerEmail,
          ticketId: String(ticket._id),
          code: mailErr?.code,
          response: mailErr?.response,
          message: mailErr?.message,
        });
      }
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
        // accessToken is returned to the same submitter so they can immediately
        // upload attachments. It grants the same access as the emailed magic link.
        accessToken: token,
        trackingUrl: ENV.IS_TEST ? trackingUrl : undefined,
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

    const [comments, attachments] = await Promise.all([
      Comment.find({ ticketId: ticket._id, isInternal: { $ne: true } })
        .sort({ createdAt: 1 })
        .select("body isAgent createdAt")
        .lean(),
      Attachment.find({ ticketId: ticket._id })
        .sort({ createdAt: 1 })
        .select("filename mimeType size url scanStatus createdAt")
        .lean(),
    ]);

    return res.json({
      data: {
        _id: ticket._id,
        subject: ticket.subject,
        body: ticket.body,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        comments,
        attachments,
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

    // Bump ticket so dashboard sort-by-recency surfaces the new activity
    await Ticket.updateOne({ _id: ticket._id }, { $currentDate: { updatedAt: true } });

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
 * GET /public/tickets -- list all tickets for a customer (portal_access token required).
 * Query: ?token=<jwt>&email=<email>&tenantSlug=<slug>&page=1&limit=20
 */
publicTicketsRouter.get("/tickets", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    if (payload.type !== "portal_access") {
      return res.status(403).json({ error: "portal_token_required", message: "A portal access token is required for listing tickets" });
    }

    const tenantSlug = (req.query.tenantSlug as string || "").toLowerCase();
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean();
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    if (String(tenant._id) !== payload.tid) {
      return res.status(403).json({ error: "access_denied" });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: tenant._id, customerEmail: payload.email.toLowerCase() };
    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("subject status priority createdAt")
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    return res.json({
      data: tickets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
});

/**
 * GET /public/tickets/:id/timeline?token=<jwt> -- trust timeline for a ticket.
 * Builds a combined timeline from statusHistory, comments, and SLA data.
 */
publicTicketsRouter.get("/tickets/:id/timeline", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);

    // For per-ticket timeline, accept both customer_access (with matching ticketId) and portal_access
    if (payload.type === "customer_access" && payload.ticketId && payload.ticketId !== req.params.id) {
      return res.status(403).json({ error: "access_denied" });
    }

    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

    if (String(ticket.tenantId) !== payload.tid) {
      return res.status(403).json({ error: "access_denied" });
    }
    if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) {
      return res.status(403).json({ error: "access_denied" });
    }

    const events: any[] = [];

    // 1. Status history entries
    if (ticket.statusHistory?.length) {
      for (const entry of ticket.statusHistory) {
        events.push({
          type: "status_change",
          from: entry.from,
          to: entry.to,
          description: `Status changed to ${entry.to}`,
          timestamp: entry.timestamp,
          actor: "Support Team",
        });
      }
    }

    // 2. Non-internal comments
    const comments = await Comment.find({ ticketId: ticket._id, isInternal: { $ne: true } })
      .sort({ createdAt: 1 })
      .select("body isAgent createdAt")
      .lean();

    for (const c of comments) {
      events.push({
        type: "reply",
        sender: c.isAgent ? "Support Agent" : "You",
        body: c.body,
        timestamp: c.createdAt,
      });
    }

    // 3. SLA commitment
    if (ticket.sla) {
      if (ticket.sla.firstResponseDue) {
        const targetHours = Math.round(
          (new Date(ticket.sla.firstResponseDue).getTime() - new Date(ticket.createdAt).getTime()) / 3600000
        );
        events.push({
          type: "sla_commitment",
          description: `Our target response time: ${targetHours} hours`,
          timestamp: ticket.createdAt,
        });
      }

      // 4. SLA met or breached
      if (ticket.sla.firstRespondedAt) {
        const breached = ticket.sla.firstResponseBreached;
        events.push({
          type: breached ? "sla_breached" : "sla_met",
          description: breached ? "First response SLA breached" : "First response SLA met",
          timestamp: ticket.sla.firstRespondedAt,
        });
      }
    }

    // Sort all events by timestamp ascending
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return res.json({
      data: {
        events,
        ticket: {
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt,
        },
      },
    });
  } catch {
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
});

/**
 * POST /public/tickets/:id/attachments?token=<jwt> -- upload a file attachment to a ticket as a customer.
 * Multipart/form-data with field "file". Allowed: png, jpeg, jpg, pdf. Max 10 MB.
 */
registry.registerPath({
  tags: ["Tickets (Public/Customer)"],
  method: "post",
  path: "/public/tickets/{id}/attachments",
  description: "Upload a file attachment to a customer ticket. Max 10 MB. Allowed: png, jpeg, jpg, pdf.",
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ token: z.string() }),
  },
  responses: {
    201: { description: "Uploaded" },
    400: { description: "Invalid file type or too large" },
    401: { description: "Invalid or expired token" },
    403: { description: "Access denied" },
    404: { description: "Ticket not found" },
  },
  security: [],
});

publicTicketsRouter.post(
  "/tickets/:id/attachments",
  publicUpload.single("file"),
  async (req, res) => {
    const tokenStr = req.query.token as string;
    if (!tokenStr) return res.status(401).json({ error: "token_required" });

    try {
      const payload = verifyCustomerToken(tokenStr);

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

      if (String(ticket.tenantId) !== payload.tid) {
        return res.status(403).json({ error: "access_denied" });
      }
      if (ticket.customerEmail?.toLowerCase() !== payload.email.toLowerCase()) {
        return res.status(403).json({ error: "access_denied" });
      }
      // For customer_access (single-ticket) tokens, the ticketId must match.
      if (payload.type === "customer_access" && payload.ticketId && payload.ticketId !== String(ticket._id)) {
        return res.status(403).json({ error: "access_denied" });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ error: "no_file", message: "No file uploaded" });

      const stored = await storeFile(file.buffer, file.originalname, file.mimetype, String(ticket.tenantId));

      const attachment = await Attachment.create({
        tenantId: ticket.tenantId,
        ticketId: ticket._id,
        url: stored.url,
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
        checksum: stored.checksum,
        scanStatus: "PENDING",
      });

      scanAttachment(String(attachment._id)).catch(() => {});

      return res.status(201).json({
        data: {
          _id: attachment._id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          scanStatus: attachment.scanStatus,
          url: attachment.url,
        },
      });
    } catch (e: any) {
      if (e?.name === "JsonWebTokenError" || e?.name === "TokenExpiredError") {
        return res.status(401).json({ error: "invalid_or_expired_token" });
      }
      if (e?.message?.includes("File type not allowed")) {
        return res.status(400).json({ error: "invalid_file_type", message: e.message });
      }
      if (e?.message?.includes("File too large")) {
        return res.status(400).json({ error: "file_too_large", message: e.message });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// Multer error handler for the public router (file size etc.)
publicTicketsRouter.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "file_too_large", message: "File exceeds 10MB limit" });
    }
    return res.status(400).json({ error: "upload_error", message: err.message });
  }
  if (err?.message?.includes("File type not allowed")) {
    return res.status(400).json({ error: "invalid_file_type", message: err.message });
  }
  next(err);
});

/**
 * POST /public/tickets/request-portal-access -- request a portal-level magic link.
 * Customer provides email + tenantSlug, and a portal token is emailed.
 */
publicTicketsRouter.post("/tickets/request-portal-access", async (req, res) => {
  try {
    const body = z.object({
      email: z.string().email(),
      tenantSlug: z.string().min(1),
    }).parse(req.body);

    const tenant = await Tenant.findOne({ slug: body.tenantSlug.toLowerCase() });
    if (!tenant) return res.status(200).json({ ok: true }); // don't leak tenant existence

    // Verify the customer has at least one ticket in this tenant
    const hasTicket = await Ticket.exists({
      tenantId: tenant._id,
      customerEmail: body.email.toLowerCase(),
    });
    if (!hasTicket) return res.status(200).json({ ok: true }); // don't leak

    const token = signPortalToken(body.email.toLowerCase(), String(tenant._id));
    const portalUrl = `${ENV.FRONTEND_ORIGIN}/portal?token=${encodeURIComponent(token)}&tenant=${encodeURIComponent(tenant.slug)}`;

    if (!ENV.EMAILS_DISABLED) {
      await sendEmail({
        to: body.email,
        subject: `Your support portal access link`,
        html: `<p>Here is your portal link to view all your tickets: <a href="${portalUrl}">Open Portal</a></p>`,
        text: `View all your tickets: ${portalUrl}`,
      });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true }); // always 200 to prevent enumeration
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

/**
 * GET /public/portal/resolve -- echo back the tenant slug for a portal/customer token.
 * Exists so already-sent magic links whose URL omits `&tenant=<slug>` can still
 * bootstrap the portal session. No PII returned beyond what's already in the token.
 */
registry.registerPath({
  tags: ["Portal (Customer)"],
  method: "get",
  path: "/public/portal/resolve",
  description: "Resolve the tenant slug for a given customer-portal token so the portal UI can bootstrap from a slug-less magic link.",
  request: { query: z.object({ token: z.string() }) },
  responses: { 200: { description: "OK" }, 401: { description: "Invalid token" } },
  security: [],
});

publicTicketsRouter.get("/portal/resolve", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    const tenant = await Tenant.findById(asObjectId(payload.tid)).select("slug").lean();
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
    return res.json({ data: { tenantSlug: tenant.slug, type: payload.type } });
  } catch {
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
});

/* ────────────────────────────────────────────────────────────────────────
 * Customer self-service profile (portal_access token required).
 * The (tenantId, email) pair identifies the Customer row — email is the
 * stable identity and cannot be changed here. Name and phone are editable.
 * If no Customer row exists yet (ticket created before model was wired up),
 * we upsert on PUT so the portal still works for legacy emails.
 * ──────────────────────────────────────────────────────────────────────── */

const CustomerProfileUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

registry.registerPath({
  tags: ["Portal (Customer)"],
  method: "get",
  path: "/public/customers/me",
  description: "Fetch the authenticated customer's profile. Portal access token required.",
  request: { query: z.object({ token: z.string() }) },
  responses: { 200: { description: "OK" }, 401: { description: "Invalid token" } },
  security: [],
});

publicTicketsRouter.get("/customers/me", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    if (payload.type !== "portal_access") {
      return res.status(403).json({ error: "portal_token_required" });
    }

    const email = payload.email.toLowerCase();
    const customer = await Customer.findOne({ tenantId: asObjectId(payload.tid), email }).lean();
    if (!customer) {
      return res.json({ data: { email, name: "", phone: "" } });
    }
    return res.json({ data: { email: customer.email, name: customer.name, phone: customer.phone || "" } });
  } catch {
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
});

registry.registerPath({
  tags: ["Portal (Customer)"],
  method: "put",
  path: "/public/customers/me",
  description: "Update the authenticated customer's profile (name, phone). Email is immutable.",
  request: {
    query: z.object({ token: z.string() }),
    body: { content: { "application/json": { schema: CustomerProfileUpdateBody } } },
  },
  responses: { 200: { description: "Updated" }, 401: { description: "Invalid token" }, 400: { description: "Invalid request" } },
  security: [],
});

publicTicketsRouter.put("/customers/me", async (req, res) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) return res.status(401).json({ error: "token_required" });

  try {
    const payload = verifyCustomerToken(tokenStr);
    if (payload.type !== "portal_access") {
      return res.status(403).json({ error: "portal_token_required" });
    }

    const body = CustomerProfileUpdateBody.parse(req.body);
    const email = payload.email.toLowerCase();
    const tenantId = asObjectId(payload.tid);

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.phone !== undefined) update.phone = body.phone;

    const customer = await Customer.findOneAndUpdate(
      { tenantId, email },
      { $set: update, $setOnInsert: { tenantId, email, name: body.name || email } },
      { new: true, upsert: true },
    ).lean();

    return res.json({ data: { email: customer.email, name: customer.name, phone: customer.phone || "" } });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "invalid_or_expired_token" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});
