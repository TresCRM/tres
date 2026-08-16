import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { sanitizeUserHtml } from "../utils/sanitize";
import { Ticket, type TicketStatus } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Attachment } from "../models/Attachment";
import { sendEmail } from "../services/mailer";
import { signCustomerToken, buildTicketTrackingUrl } from "../utils/customerToken";
import { ENV } from "../config/env";
import { registry } from "../docs/swagger";
import { badRequest } from "../utils/http";
import { emitTicketEvent } from "../events/emitter";
import { requireActiveSubscription } from "../middlewares/subscriptionGuard";
import { enforceTicketLimit } from "../middlewares/freeTierGuard";
import { Tenant } from "../models/Tenant";
import { randomUUID } from "crypto";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { Types } from "mongoose";
import { MongoServerError } from "mongodb";
import { logActivity } from "../utils/log";
import {
  TICKET_STATUSES,
  validateTransition,
  getAllowedTransitions,
  statusOnAssign,
} from "../utils/ticket-state-machine";
import { TicketLink } from "../models/TicketLink";

extendZodWithOpenApi(z);

/** Escape special regex characters to prevent ReDoS */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }, z.array(item));

export const ticketsRouter = Router();

/* ---------- schemas ---------- */
const StatusEnum = z.enum(TICKET_STATUSES as unknown as [string, ...string[]]);

export const TicketSchema = z.object({
  _id: z.string(),
  tenantId: z.string(),
  subject: z.string(),
  body: z.string(),
  status: StatusEnum,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assigneeId: z.string().optional().nullable(),
  customerEmail: z.email().optional().nullable(),
  tags: z.array(z.string()).optional(),
  watchers: z.array(z.email()).optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CommentSchema = z.object({
  _id: z.string(),
  tenantId: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  body: z.string(),
  isAgent: z.boolean(),
  createdAt: z.string(),
});

const CreateTicketBody = z.object({
  subject: z.string().min(3),
  body: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  customerEmail: z.email().optional(),
  tags: listOf(z.string()).optional(),
  watchers: listOf(z.email()).optional(),
});

const ListQuery = z.object({
  status: StatusEnum.optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assigneeId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const ReplyBody = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().optional(),
});

const AssignBody = z.object({ assigneeId: z.string() });

const StatusTransitionBody = z.object({
  status: StatusEnum,
  reason: z.string().optional(),
});

/* ---------- helpers ---------- */

/** Push status history entry and update status atomically */
function applyTransition(
  ticket: any,
  to: TicketStatus,
  changedBy: string,
  reason?: string
) {
  const from = ticket.status as TicketStatus;
  ticket.statusHistory.push({
    from,
    to,
    changedBy,
    reason,
    timestamp: new Date(),
  });
  ticket.status = to;

  // Track SLA-relevant timestamps
  if (to === "RESOLVED" || to === "CLOSED") {
    if (ticket.sla && !ticket.sla.resolvedAt) {
      ticket.sla.resolvedAt = new Date();
    }
  }
  // Pause SLA clock when awaiting customer
  if (to === "AWAITING_CUSTOMER" && ticket.sla && !ticket.sla.pausedAt) {
    ticket.sla.pausedAt = new Date();
  }
  // Resume SLA clock when leaving awaiting customer
  if (from === "AWAITING_CUSTOMER" && ticket.sla?.pausedAt) {
    const pausedMs = Date.now() - new Date(ticket.sla.pausedAt).getTime();
    ticket.sla.totalPausedMs = (ticket.sla.totalPausedMs || 0) + pausedMs;
    ticket.sla.pausedAt = undefined;
    // Shift due dates
    if (ticket.sla.firstResponseDue && !ticket.sla.firstRespondedAt) {
      ticket.sla.firstResponseDue = new Date(
        new Date(ticket.sla.firstResponseDue).getTime() + pausedMs
      );
    }
    if (ticket.sla.resolutionDue && !ticket.sla.resolvedAt) {
      ticket.sla.resolutionDue = new Date(
        new Date(ticket.sla.resolutionDue).getTime() + pausedMs
      );
    }
  }
}

/* ---------- openapi registrations ---------- */
registry.register("Ticket", TicketSchema);
registry.register("Comment", CommentSchema);

registry.registerPath({
  tags: ["Tickets"], method: "get", path: "/api/v1/tickets",
  description: "List tickets with filters and cursor pagination.",
  request: { query: ListQuery },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(TicketSchema), nextCursor: z.string().optional() }),
        },
      },
    },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "get", path: "/api/v1/tickets/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ data: TicketSchema.extend({ comments: z.array(CommentSchema) }) }),
        },
      },
    },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "post", path: "/api/v1/tickets",
  request: {
    headers: z.object({ "Idempotency-Key": z.string().optional() }).partial(),
    body: { content: { "application/json": { schema: CreateTicketBody } } },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: z.object({ data: TicketSchema, idempotent: z.boolean().optional() }),
        },
      },
    },
    402: { description: "Payment required (expired subscription)" },
    400: { description: "Validation error" },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "post", path: "/api/v1/tickets/{id}/reply",
  request: {
    params: z.object({ id: z.string() }),
    headers: z.object({ "Idempotency-Key": z.string().optional() }).partial(),
    body: { content: { "application/json": { schema: ReplyBody } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: z.object({ data: CommentSchema, idempotent: z.boolean().optional() }) } },
    },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "post", path: "/api/v1/tickets/{id}/assign",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: AssignBody } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: TicketSchema }) } } },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "post", path: "/api/v1/tickets/{id}/close",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: TicketSchema }) } } },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  tags: ["Tickets"], method: "post", path: "/api/v1/tickets/{id}/status",
  description: "Explicitly transition a ticket to a new status.",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: StatusTransitionBody } } },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({ data: TicketSchema }),
        },
      },
    },
    400: { description: "Invalid transition" },
    404: { description: "Not found" },
  },
});

/* ---------- routes ---------- */

// GET list with filters + cursor pagination
ticketsRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.assigneeId) filter.assigneeId = asObjectId(q.assigneeId);
  if (q.q) {
    const safeQ = escapeRegex(q.q);
    filter.$or = [
      { subject: { $regex: safeQ, $options: "i" } },
      { body: { $regex: safeQ, $options: "i" } },
      { tags: q.q },
    ];
  }

  const cursorCond = q.cursor ? { _id: { $lt: new Types.ObjectId(q.cursor) } } : {};
  const items = await Ticket.find({ ...filter, ...cursorCond })
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
  res.json({ data: items, nextCursor });
});

// GET single with comments
ticketsRouter.get("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const ticket = await Ticket.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();
  if (!ticket) return res.status(404).json({ error: "not_found" });

  // If merged, return redirect info
  if (ticket.mergedInto) {
    return res.json({
      data: {
        ...ticket,
        _merged: true,
        _mergedInto: String(ticket.mergedInto),
      },
      comments: [],
    });
  }

  const [comments, attachments] = await Promise.all([
    Comment.find({
      tenantId: asObjectId(auth.tid),
      ticketId: ticket._id,
    })
      .sort({ createdAt: 1 })
      .lean(),
    Attachment.find({
      tenantId: asObjectId(auth.tid),
      ticketId: ticket._id,
    })
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  res.json({ data: { ...ticket, comments, attachments } });
});

// POST create with Idempotency-Key
ticketsRouter.post(
  "/",
  requireAuth,
  requirePermission("TICKET_CREATE"),
  requireActiveSubscription({ write: true }),
  enforceTicketLimit(),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    try {
      const parsed = CreateTicketBody.safeParse(req.body);
      if (!parsed.success) {
        return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
      }
      const body = parsed.data;
      const requestId = req.header("Idempotency-Key") || randomUUID();

      const existing = await Ticket.findOne({ tenantId: auth.tid, requestId }).lean();
      if (existing) {
        return res.status(201).json({ data: existing, idempotent: true });
      }

      const created = await Ticket.create({
        tenantId: auth.tid,
        subject: body.subject,
        body: sanitizeUserHtml(body.body),
        status: "OPEN",
        priority: body.priority,
        customerEmail: body.customerEmail,
        tags: body.tags,
        watchers: body.watchers,
        createdBy: auth.sub,
        requestId,
        statusHistory: [
          { from: "NEW", to: "OPEN", changedBy: auth.sub, reason: "Ticket created", timestamp: new Date() },
        ],
      });

      if (!(req as any)._ticketCountIncremented) {
        await Tenant.updateOne({ _id: asObjectId(auth.tid) }, { $inc: { lifetimeTicketCount: 1 } });
      }

      // Email the customer a magic-link so they can join the portal, view, and reply.
      // Best-effort: SMTP failure must not fail the create request.
      if (!ENV.EMAILS_DISABLED && body.customerEmail) {
        const customerEmail = body.customerEmail.toLowerCase();
        const token = signCustomerToken({
          email: customerEmail,
          tid: auth.tid,
          ticketId: String(created._id),
        });
        const tenantDoc = await Tenant.findById(auth.tid).select("branding slug").lean();
        const trackingUrl = buildTicketTrackingUrl(String(created._id), token, tenantDoc?.slug);
        const brandName = tenantDoc?.branding?.name || "Support";
        try {
          await sendEmail({
            to: customerEmail,
            subject: `Ticket #${created._id} opened -- ${body.subject}`,
            messageKey: "ticket_created_customer",
            html: [
              `<p>Hello,</p>`,
              `<p>${brandName} has opened a support ticket on your behalf: <strong>${body.subject}</strong>.</p>`,
              `<p>You can view the ticket, track its progress, and reply here:</p>`,
              `<p><a href="${trackingUrl}">View Ticket</a></p>`,
              `<p>This link expires in 7 days.</p>`,
              `<p>${brandName} Support</p>`,
            ].join("\n"),
            text: `${brandName} opened a ticket on your behalf: ${body.subject}. Track it here: ${trackingUrl}`,
          });
        } catch (mailErr: any) {
          console.error("[mail] tenant ticket.created customer email failed", {
            provider: process.env.SMTP_PROVIDER || "default",
            to: customerEmail,
            ticketId: String(created._id),
            code: mailErr?.code,
            response: mailErr?.response,
            message: mailErr?.message,
          });
        }
      }

      void emitTicketEvent(auth.tid, {
        event: "ticket.created",
        ticketId: String(created._id),
      });
      try {
        await logActivity(req, { action: "ticket.created", http: 201, meta: { ticketId: String(created._id) } });
      } catch { /* ignore */ }
      return res.status(201).json({ data: created, idempotent: !!req.header("Idempotency-Key") });
    } catch (e: any) {
      if (e instanceof ZodError) {
        return res.status(400).json({ error: "invalid_request", details: JSON.stringify(e) });
      }
      if (e instanceof MongoServerError && e.code === 11000) {
        const found = await Ticket.findOne({ tenantId: auth.tid, requestId: req.header("Idempotency-Key") }).lean();
        if (found) return res.status(201).json({ data: found, idempotent: true });
      }
      req.log?.error?.({ e }, "ticket.create failed");
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// POST /:id/resend-invite — resend the customer magic-link invite for an existing ticket.
ticketsRouter.post(
  "/:id/resend-invite",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    }).lean();
    if (!ticket) return res.status(404).json({ error: "not_found" });

    if (!ticket.customerEmail) {
      return res.status(400).json({
        error: "no_customer_email",
        message: "This ticket has no customer email on file. Add one before resending the invite.",
      });
    }
    if (ENV.EMAILS_DISABLED) {
      return res.status(503).json({ error: "emails_disabled", message: "Email delivery is disabled in this environment." });
    }

    const customerEmail = ticket.customerEmail.toLowerCase();
    const token = signCustomerToken({
      email: customerEmail,
      tid: auth.tid,
      ticketId: String(ticket._id),
    });
    const tenantDoc = await Tenant.findById(auth.tid).select("branding slug").lean();
    const trackingUrl = buildTicketTrackingUrl(String(ticket._id), token, tenantDoc?.slug);
    const brandName = tenantDoc?.branding?.name || "Support";

    try {
      await sendEmail({
        to: customerEmail,
        subject: `Your ticket tracking link -- #${ticket._id}`,
        messageKey: "ticket_invite_resend",
        html: [
          `<p>Hello,</p>`,
          `<p>Here is a fresh link to view and reply to your ticket with ${brandName}: <strong>${ticket.subject}</strong>.</p>`,
          `<p><a href="${trackingUrl}">View Ticket</a></p>`,
          `<p>This link expires in 7 days.</p>`,
          `<p>${brandName} Support</p>`,
        ].join("\n"),
        text: `Here is a fresh tracking link for ticket "${ticket.subject}": ${trackingUrl}`,
      });
    } catch (mailErr: any) {
      console.error("[mail] resend-invite failed", {
        provider: process.env.SMTP_PROVIDER || "default",
        to: customerEmail,
        ticketId: String(ticket._id),
        code: mailErr?.code,
        response: mailErr?.response,
        message: mailErr?.message,
      });
      return res.status(502).json({
        error: "email_send_failed",
        message: "Could not deliver the invite email. Check the SMTP configuration.",
      });
    }

    try {
      await logActivity(req, {
        action: "ticket.invite_resent",
        http: 200,
        meta: { ticketId: String(ticket._id), to: customerEmail },
      });
    } catch { /* ignore */ }

    return res.json({ ok: true, sentTo: customerEmail });
  }
);

// POST /:id/status — explicit status transition
ticketsRouter.post(
  "/:id/status",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = StatusTransitionBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const { status: targetStatus, reason } = parsed.data;

    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    const result = validateTransition(ticket.status as TicketStatus, targetStatus as TicketStatus);
    if (!result.valid) {
      return res.status(400).json({
        error: "invalid_transition",
        message: result.message,
        currentStatus: ticket.status,
        allowedTransitions: result.allowed,
      });
    }

    applyTransition(ticket, targetStatus as TicketStatus, auth.sub, reason);
    await ticket.save();

    void emitTicketEvent(auth.tid, {
      event: "ticket.status_changed",
      ticketId: String(ticket._id),
      from: ticket.statusHistory[ticket.statusHistory.length - 1]?.from,
      to: targetStatus,
    });
    try {
      await logActivity(req, { action: "ticket.status_changed", http: 200, meta: { ticketId: String(ticket._id), to: targetStatus } });
    } catch { /* ignore */ }
    res.json({ data: ticket });
  }
);

// POST /:id/reply
ticketsRouter.post(
  "/:id/reply",
  requireAuth,
  requirePermission("COMMENT_CREATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = ReplyBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const { body, isInternal } = parsed.data;
    const requestId = req.header("Idempotency-Key") || randomUUID();
    const tid = asObjectId(auth.tid);
    const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: tid });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    try {
      const comment = await Comment.create({
        tenantId: tid,
        ticketId: ticket._id,
        authorId: asObjectId(auth.sub),
        body: sanitizeUserHtml(body),
        isAgent: true,
        isInternal: isInternal || false,
        requestId,
      });

      // Track SLA first response
      if (ticket.sla && !ticket.sla.firstRespondedAt && !isInternal) {
        ticket.sla.firstRespondedAt = new Date();
        ticket.sla.firstResponseBreached =
          ticket.sla.firstResponseDue ? new Date() > ticket.sla.firstResponseDue : false;
        await ticket.save();
      }

      emitTicketEvent(auth.tid, { event: "ticket.replied", ticketId: String(ticket._id) });
      try {
        await logActivity(req, { action: "ticket.replied", http: 201, meta: { ticketId: String(ticket._id) } });
      } catch { /* ignore */ }
      return res.status(201).json({ data: comment });
    } catch (e: any) {
      if (e?.code === 11000 && e?.keyPattern?.requestId) {
        const c = await Comment.findOne({ tenantId: tid, ticketId: ticket._id, requestId }).lean();
        return res.status(201).json({ data: c, idempotent: true });
      }
      throw e;
    }
  }
);

// POST /:id/assign
ticketsRouter.post(
  "/:id/assign",
  requireAuth,
  requirePermission("TICKET_ASSIGN"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = AssignBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const { assigneeId } = parsed.data;
    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    // Auto-transition to ASSIGNED if appropriate
    const newStatus = statusOnAssign(ticket.status as TicketStatus);
    if (newStatus !== ticket.status) {
      applyTransition(ticket, newStatus, auth.sub, `Assigned to ${assigneeId}`);
    }
    ticket.assigneeId = asObjectId(assigneeId);
    await ticket.save();

    emitTicketEvent(auth.tid, {
      event: "ticket.assigned",
      ticketId: String(ticket._id),
      assigneeId,
    });
    try {
      await logActivity(req, { action: "ticket.assigned", http: 200, meta: { ticketId: String(ticket._id) } });
    } catch { /* ignore */ }
    res.json({ data: ticket });
  }
);

// POST /:id/close
ticketsRouter.post(
  "/:id/close",
  requireAuth,
  requirePermission("TICKET_CLOSE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    const result = validateTransition(ticket.status as TicketStatus, "CLOSED");
    if (!result.valid) {
      return res.status(400).json({
        error: "invalid_transition",
        message: result.message,
        currentStatus: ticket.status,
        allowedTransitions: result.allowed,
      });
    }

    applyTransition(ticket, "CLOSED", auth.sub, "Manually closed");
    ticket.closedBy = auth.sub;
    ticket.closeReason = "manual";
    await ticket.save();

    emitTicketEvent(auth.tid, {
      event: "ticket.closed",
      ticketId: String(ticket._id),
      customerEmail: ticket.customerEmail,
      tenantId: auth.tid,
    });
    try {
      await logActivity(req, { action: "ticket.closed", http: 200, meta: { ticketId: String(ticket._id) } });
    } catch { /* ignore */ }
    res.json({ data: ticket });
  }
);

// POST /:id/reopen
ticketsRouter.post(
  "/:id/reopen",
  requireAuth,
  requirePermission("TICKET_REOPEN"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!ticket) return res.status(404).json({ error: "not_found" });

    const result = validateTransition(ticket.status as TicketStatus, "REOPENED");
    if (!result.valid) {
      return res.status(400).json({
        error: "invalid_transition",
        message: result.message,
        currentStatus: ticket.status,
        allowedTransitions: result.allowed,
      });
    }

    applyTransition(ticket, "REOPENED", auth.sub, "Reopened");
    await ticket.save();

    emitTicketEvent(auth.tid, {
      event: "ticket.reopened",
      ticketId: String(ticket._id),
    });
    try {
      await logActivity(req, { action: "ticket.reopened", http: 200, meta: { ticketId: String(ticket._id) } });
    } catch { /* ignore */ }
    res.json({ data: ticket });
  }
);

// POST /:id/reassign
ticketsRouter.post(
  "/:id/reassign",
  requireAuth,
  requirePermission("TICKET_ASSIGN"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = z.object({ assigneeId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.message });
    const { assigneeId } = parsed.data;

    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!ticket) return res.status(404).json({ error: "not_found" });
    if (ticket.status === "CLOSED") {
      return res.status(400).json({ error: "invalid_status", message: "Cannot reassign a CLOSED ticket" });
    }

    const now = new Date();
    if (ticket.assigneeId) {
      if (!ticket.assignmentHistory) ticket.assignmentHistory = [];
      ticket.assignmentHistory.push({
        assigneeId: ticket.assigneeId,
        assignedAt: ticket.updatedAt || ticket.createdAt,
        reassignedAt: now,
      });
    }

    // Transition to ASSIGNED on reassign if currently TRANSFERRED
    const newStatus = statusOnAssign(ticket.status as TicketStatus);
    if (newStatus !== ticket.status) {
      applyTransition(ticket, newStatus, auth.sub, `Reassigned to ${assigneeId}`);
    }

    ticket.assigneeId = asObjectId(assigneeId);
    await ticket.save();

    emitTicketEvent(auth.tid, {
      event: "ticket.reassigned",
      ticketId: String(ticket._id),
      newAssigneeId: assigneeId,
      reassignedAt: now.toISOString(),
    });
    try {
      await logActivity(req, { action: "ticket.reassigned", http: 200, meta: { ticketId: String(ticket._id), assigneeId } });
    } catch { /* ignore */ }
    res.json({ data: ticket });
  }
);

// GET /:id/transitions — get allowed transitions for a ticket
ticketsRouter.get(
  "/:id/transitions",
  requireAuth,
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    }).lean();
    if (!ticket) return res.status(404).json({ error: "not_found" });

    const allowed = getAllowedTransitions(ticket.status as TicketStatus);
    res.json({ currentStatus: ticket.status, allowedTransitions: allowed });
  }
);

/* ========== Ticket Merge & Link ========== */

const MergeBody = z.object({
  sourceTicketId: z.string().min(1),
  reason: z.string().optional(),
});

const LinkBody = z.object({
  linkedTicketId: z.string().min(1),
  relationship: z.enum(["related", "parent", "child", "blocked_by", "duplicate"]),
});

const INVERSE_RELATIONSHIP: Record<string, string> = {
  related: "related",
  duplicate: "duplicate",
  parent: "child",
  child: "parent",
  blocked_by: "blocks",
  blocks: "blocked_by",
};

// POST /:targetId/merge — merge source ticket into target
ticketsRouter.post(
  "/:targetId/merge",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = MergeBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const { sourceTicketId, reason } = parsed.data;
    const tid = asObjectId(auth.tid);
    const targetId = asObjectId(req.params.targetId);

    // Validate: source !== target
    if (sourceTicketId === req.params.targetId) {
      return res.status(400).json({ error: "invalid_request", message: "Cannot merge a ticket into itself" });
    }

    // Load both tickets (same tenant)
    const [source, target] = await Promise.all([
      Ticket.findOne({ _id: asObjectId(sourceTicketId), tenantId: tid }),
      Ticket.findOne({ _id: targetId, tenantId: tid }),
    ]);
    if (!source) return res.status(404).json({ error: "not_found", message: "Source ticket not found" });
    if (!target) return res.status(404).json({ error: "not_found", message: "Target ticket not found" });

    // Source must not already be merged
    if (source.mergedInto) {
      return res.status(400).json({ error: "already_merged", message: "Source ticket is already merged" });
    }

    // 1. Copy all comments from source to target (preserve original author/timestamps)
    const sourceComments = await Comment.find({ tenantId: tid, ticketId: source._id }).lean();
    if (sourceComments.length > 0) {
      const copies = sourceComments.map((c) => ({
        tenantId: c.tenantId,
        ticketId: target._id,
        authorId: c.authorId,
        body: c.body,
        isAgent: c.isAgent,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
      }));
      await Comment.insertMany(copies);
    }

    // 2. Close the source ticket
    const sourceStatus = source.status;
    source.status = "CLOSED" as TicketStatus;
    source.closeReason = "merged";
    source.closedBy = auth.sub;
    source.mergedInto = targetId;
    source.statusHistory.push({
      from: sourceStatus,
      to: "CLOSED",
      changedBy: auth.sub,
      reason: reason || `Merged into #${req.params.targetId}`,
      timestamp: new Date(),
    });
    await source.save();

    // 3. Add history note to target (status doesn't change)
    target.statusHistory.push({
      from: target.status,
      to: target.status,
      changedBy: auth.sub,
      reason: `Merged from #${sourceTicketId}`,
      timestamp: new Date(),
    });
    await target.save();

    // 4. Emit event
    void emitTicketEvent(auth.tid, {
      event: "ticket.merged",
      sourceTicketId: String(source._id),
      targetTicketId: String(target._id),
    });
    try {
      await logActivity(req, {
        action: "ticket.merged",
        http: 200,
        meta: { sourceTicketId: String(source._id), targetTicketId: String(target._id) },
      });
    } catch { /* ignore */ }

    // Reload target with comments
    const updatedTarget = await Ticket.findById(target._id).lean();
    const comments = await Comment.find({ tenantId: tid, ticketId: target._id })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ data: { ...updatedTarget, comments } });
  }
);

// POST /:id/link — create a bidirectional link between two tickets
ticketsRouter.post(
  "/:id/link",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = LinkBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const { linkedTicketId, relationship } = parsed.data;
    const tid = asObjectId(auth.tid);
    const sourceId = asObjectId(req.params.id);

    if (req.params.id === linkedTicketId) {
      return res.status(400).json({ error: "invalid_request", message: "Cannot link a ticket to itself" });
    }

    // Verify both tickets exist in the same tenant
    const [sourceTicket, targetTicket] = await Promise.all([
      Ticket.findOne({ _id: sourceId, tenantId: tid }).lean(),
      Ticket.findOne({ _id: asObjectId(linkedTicketId), tenantId: tid }).lean(),
    ]);
    if (!sourceTicket) return res.status(404).json({ error: "not_found", message: "Source ticket not found" });
    if (!targetTicket) return res.status(404).json({ error: "not_found", message: "Linked ticket not found" });

    const inverse = INVERSE_RELATIONSHIP[relationship] ?? "related";

    try {
      // Create both directions
      const [forward] = await Promise.all([
        TicketLink.create({
          tenantId: tid,
          sourceTicketId: sourceId,
          targetTicketId: asObjectId(linkedTicketId),
          relationship,
          createdBy: asObjectId(auth.sub),
        }),
        TicketLink.create({
          tenantId: tid,
          sourceTicketId: asObjectId(linkedTicketId),
          targetTicketId: sourceId,
          relationship: inverse,
          createdBy: asObjectId(auth.sub),
        }),
      ]);

      void emitTicketEvent(auth.tid, {
        event: "ticket.linked",
        sourceTicketId: req.params.id,
        targetTicketId: linkedTicketId,
        relationship,
      });
      try {
        await logActivity(req, {
          action: "ticket.linked",
          http: 201,
          meta: { sourceTicketId: req.params.id, targetTicketId: linkedTicketId, relationship },
        });
      } catch { /* ignore */ }

      res.status(201).json({ data: forward });
    } catch (e: any) {
      if (e instanceof MongoServerError && e.code === 11000) {
        return res.status(409).json({ error: "already_linked", message: "These tickets are already linked" });
      }
      throw e;
    }
  }
);

// DELETE /:id/link/:linkedTicketId — remove bidirectional link
ticketsRouter.delete(
  "/:id/link/:linkedTicketId",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const tid = asObjectId(auth.tid);
    const ticketA = asObjectId(req.params.id);
    const ticketB = asObjectId(req.params.linkedTicketId);

    // Remove both directions
    const result = await TicketLink.deleteMany({
      tenantId: tid,
      $or: [
        { sourceTicketId: ticketA, targetTicketId: ticketB },
        { sourceTicketId: ticketB, targetTicketId: ticketA },
      ],
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "not_found", message: "Link not found" });
    }

    void emitTicketEvent(auth.tid, {
      event: "ticket.unlinked",
      sourceTicketId: req.params.id,
      targetTicketId: req.params.linkedTicketId,
    });
    try {
      await logActivity(req, {
        action: "ticket.unlinked",
        http: 200,
        meta: { sourceTicketId: req.params.id, targetTicketId: req.params.linkedTicketId },
      });
    } catch { /* ignore */ }

    res.json({ success: true });
  }
);

// GET /:id/links — get all links for a ticket with previews
ticketsRouter.get(
  "/:id/links",
  requireAuth,
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const tid = asObjectId(auth.tid);
    const ticketId = asObjectId(req.params.id);

    // Verify the ticket exists
    const ticket = await Ticket.findOne({ _id: ticketId, tenantId: tid }).lean();
    if (!ticket) return res.status(404).json({ error: "not_found" });

    // Get all links where this ticket is the source (bidirectional already stored)
    const links = await TicketLink.find({ tenantId: tid, sourceTicketId: ticketId }).lean();

    if (links.length === 0) {
      return res.json({ data: [] });
    }

    // Fetch previews for linked tickets
    const linkedTicketIds = links.map((l) => l.targetTicketId);
    const linkedTickets = await Ticket.find(
      { _id: { $in: linkedTicketIds }, tenantId: tid },
      { subject: 1, status: 1, priority: 1 }
    ).lean();

    const ticketMap = new Map(linkedTickets.map((t) => [String(t._id), t]));

    const data = links.map((link) => {
      const linked = ticketMap.get(String(link.targetTicketId));
      return {
        _id: link._id,
        ticketId: String(link.targetTicketId),
        relationship: link.relationship,
        createdBy: String(link.createdBy),
        createdAt: link.createdAt,
        ticket: linked
          ? { subject: linked.subject, status: linked.status, priority: linked.priority }
          : null,
      };
    });

    res.json({ data });
  }
);
