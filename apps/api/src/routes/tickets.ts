import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { sanitizeUserHtml } from "../utils/sanitize";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { registry } from "../docs/swagger";
import { badRequest } from "../utils/http";
// import { nanoid } from "nanoid";
import { emitTicketEvent } from "../events/emitter";
import { requireActiveSubscription } from "../middlewares/subscriptionGuard";
import { enforceTicketLimit } from "../middlewares/freeTierGuard";
import { Tenant } from "../models/Tenant";
import { randomUUID } from "crypto";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { Types } from "mongoose";
import { MongoServerError } from "mongodb";
import { logActivity } from "../utils/log";
extendZodWithOpenApi(z);

/** Escape special regex characters to prevent ReDoS */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }, z.array(item));

export const ticketsRouter = Router();

/* ---------- schemas ---------- */
// Reusable components
export const TicketSchema = z.object({
  _id: z.string(),
  tenantId: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(["ACTIVE","CLOSED","REOPENED"]),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  assigneeId: z.string().optional().nullable(),
  customerEmail: z.email().optional().nullable(),
  tags: z.array(z.string()).optional(),
  watchers: z.array(z.email()).optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export const CommentSchema = z.object({
  _id: z.string(),
  tenantId: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  body: z.string(),
  isAgent: z.boolean(),
  createdAt: z.string()
});
const CreateTicketBody = z.object({
  subject: z.string().min(3),
  body: z.string().min(1),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  customerEmail: z.email().optional(),
  // Accept "urgent" or ["urgent", "vip"]
  tags: listOf(z.string()).optional(),
  // Accept "a@b.c" or ["a@b.c","c@d.e"]
  watchers: listOf(z.email()).optional()
});

const ListQuery = z.object({
  status: z.enum(["ACTIVE","CLOSED","REOPENED"]).optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  assigneeId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional()   // createdAt ISO or _id string
});

const ReplyBody = z.object({ body: z.string().min(1) });
const AssignBody = z.object({ assigneeId: z.string() });

/* ---------- openapi registrations (abbrev) ---------- */
// Register components (names appear in the schema)
registry.register("Ticket", TicketSchema);
registry.register("Comment", CommentSchema);
// List tickets
registry.registerPath({
  tags: ["Tickets"],
  method: "get",
  path: "/api/v1/tickets",
  description: "List tickets with filters and cursor pagination.",
  request: {
    query: ListQuery,
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(TicketSchema),
            nextCursor: z.string().optional()
          }),
          example: {
            data: [
              { _id:"...", subject:"Login issue", body:"...", status:"ACTIVE", priority:"HIGH", createdAt:"2025-01-01T00:00:00.000Z" }
            ],
            nextCursor: "2025-01-01T00:00:00.000Z"
          }
        }
      }
    }
  }
});

// Get one (with comments)
registry.registerPath({
  tags: ["Tickets"],
  method: "get",
  path: "/api/v1/tickets/{id}",
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            data: TicketSchema.extend({ comments: z.array(CommentSchema) })
          })
        }
      }
    },
    404: { description: "Not found" }
  }
});

// Create
registry.registerPath({
  tags: ["Tickets"],
  method: "post",
  path: "/api/v1/tickets",
  request: {
    headers: z.object({ "Idempotency-Key": z.string().optional() }).partial(),
    body: { content: { "application/json": { schema: CreateTicketBody } } }
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": { schema: z.object({ data: TicketSchema, idempotent: z.boolean().optional() }),
          example: { data: { _id:"...", subject:"Login issue", body:"...", status:"ACTIVE" } } }
      }
    },
    402: { description: "Payment required (expired subscription)" },
    400: { description: "Validation error" }
  }
});

// Reply
registry.registerPath({
  tags: ["Tickets"],
  method: "post",
  path: "/api/v1/tickets/{id}/reply",
  request: {
    params: z.object({ id: z.string() }),
    headers: z.object({ "Idempotency-Key": z.string().optional() }).partial(),
    body: { content: { "application/json": { schema: ReplyBody } } }
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: z.object({ data: CommentSchema, idempotent: z.boolean().optional() }) } }
    },
    404: { description: "Not found" }
  }
});

// Assign
registry.registerPath({
  tags: ["Tickets"],
  method: "post",
  path: "/api/v1/tickets/{id}/assign",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: AssignBody } } }
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: TicketSchema }) } } },
    404: { description: "Not found" }
  }
});

// Close
registry.registerPath({
  tags: ["Tickets"],
  method: "post",
  path: "/api/v1/tickets/{id}/close",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: TicketSchema }) } } },
    404: { description: "Not found" }
  }
});


/* ---------- routes ---------- */

// GET list with filters + cursor pagination (by createdAt desc)
ticketsRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const q = ListQuery.parse(req.query);
  const filter:any = { tenantId: asObjectId(auth.tid) };
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.assigneeId) filter.assigneeId = asObjectId(q.assigneeId);
  if (q.q) {
    const safeQ = escapeRegex(q.q);
    filter.$or = [
      { subject: { $regex: safeQ, $options:"i" } },
      { body:    { $regex: safeQ, $options:"i" } },
      { tags: q.q }
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
ticketsRouter.get("/:id", requireAuth, async (req,res) => {
  const auth = (req as AuthRequest).auth;
  const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) }).lean();
  if (!ticket) return res.status(404).json({ error:"not_found" });
  const comments = await Comment.find({ tenantId: asObjectId(auth.tid), ticketId: ticket._id }).sort({ createdAt:1 }).lean();
  res.json({ data: { ...ticket, comments } });
});

// POST create with Idempotency-Key
ticketsRouter.post("/",
  requireAuth,
  requirePermission("TICKET_CREATE"),
  requireActiveSubscription({ write: true }),
  enforceTicketLimit(),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    try {
      const parsed = CreateTicketBody.safeParse(req.body);
      if (!parsed.success) {
        return await badRequest(
          req, 
          res, 
          "invalid_request", 
          "Validation error", 
          z.treeifyError(parsed.error)
        );
      }
      const body = parsed.data;
      const requestId = req.header("Idempotency-Key") || randomUUID();
       // 2) quick “already processed?” path (helps in retries after a crash)
       const existing = await Ticket.findOne({ tenantId: auth.tid, requestId }).lean();
       if (existing) {

        return res.status(201).json({ data: existing, idempotent: true });
       }
 
       const created = await Ticket.create({
          tenantId: auth.tid,
          subject: body.subject,
          body: sanitizeUserHtml(body.body),
          priority: body.priority,
          customerEmail: body.customerEmail,
          tags: body.tags,            // already normalized to array
          watchers: body.watchers,    // already normalized to array
         createdBy: auth.sub,
         requestId
       });

      // Only increment if freeTierGuard didn't already do it atomically
      if (!(req as any)._ticketCountIncremented) {
        await Tenant.updateOne({ _id: asObjectId(auth.tid) }, { $inc: { lifetimeTicketCount: 1 } });
      }

      void emitTicketEvent(auth.tid, { event: "ticket.created", ticketId: String(created._id) });
      try {
        await logActivity(req, { action: "ticket.created", http: 201, meta: { ticketId: String(created._id) } });
      } catch (error) {
        /*ignore*/
      }
      return res.status(201).json({ data: created, idempotent: !!req.header("Idempotency-Key") });
     } catch (e:any) {
      if (e instanceof ZodError) {
        return res.status(400).json({ error: "invalid_request", details: JSON.stringify(e) });
      }
       // 5) handle duplicate (race or retry) → return the original
       if (e instanceof MongoServerError && e.code === 11000) {
         const found = await Ticket.findOne({ tenantId: auth.tid, requestId: req.header("Idempotency-Key") }).lean();
        if (found) return res.status(201).json({ data: found, idempotent: true });
       }
 
      req.log?.error?.({ e }, "ticket.create failed");
       return res.status(500).json({ error: "internal_error" });
       }
   }
 );

// reply
ticketsRouter.post("/:id/reply",
  requireAuth,
  requirePermission("COMMENT_CREATE"),
  requireActiveSubscription({ write: true }),
  async (req,res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = ReplyBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(
        req, 
        res, 
        "invalid_request", 
        "Validation error", 
        z.treeifyError(parsed.error)
      );
    }
    const { body } = parsed.data;
    const requestId = req.header("Idempotency-Key") || randomUUID();
    const tid = asObjectId(auth.tid);
    const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: tid });
    if (!ticket) return res.status(404).json({ error:"not_found" });

    try {
      const comment = await Comment.create({
        tenantId: tid,
        ticketId: ticket._id,
        authorId: asObjectId(auth.sub),
        body: sanitizeUserHtml(body),
        isAgent:true, 
        requestId
      });
      emitTicketEvent(auth.tid, { event:"ticket.replied", ticketId: String(ticket._id) });
      try {
        await logActivity(req, { action: "ticket.replied", http: 201, meta: { ticketId: String(ticket._id) } });
      } catch (error) {
        /*ignore*/
      }
      return res.status(201).json({ data: comment });
    } catch (e:any) {
      if (e?.code === 11000 && e?.keyPattern?.requestId) {
        const c = await Comment.findOne({ tenantId: tid, ticketId: ticket._id, requestId }).lean();
        return res.status(201).json({ data: c, idempotent: true });
      }
      throw e;
    }
  }
);

// assign
ticketsRouter.post("/:id/assign",
  requireAuth,
  requirePermission("TICKET_ASSIGN"),
  requireActiveSubscription({ write: true }),
  async (req,res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = AssignBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(
        req, 
        res, 
        "invalid_request", 
        "Validation error", 
        z.treeifyError(parsed.error)
      );
    }
    const { assigneeId } = parsed.data;
    const ticket = await Ticket.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { assigneeId: asObjectId(assigneeId) }, { new: true }
    );
    if (!ticket) return res.status(404).json({ error:"not_found" });
    emitTicketEvent(auth.tid, { event:"ticket.assigned", ticketId: String(ticket._id), assigneeId });
    try {
      await logActivity(req, { action: "ticket.assigned", http: 201, meta: { ticketId: String(ticket._id) } });
    } catch (error) {
      /*ignore*/
    }
    res.json({ data: ticket });
  }
);

// close
ticketsRouter.post("/:id/close",
  requireAuth,
  requirePermission("TICKET_CLOSE"),
  requireActiveSubscription({ write: true }),
  async (req,res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { status: "CLOSED" }, { new: true }
    );
    if (!ticket) return res.status(404).json({ error:"not_found" });
    // emitTicketEvent(auth.tid, { event:"ticket.closed", ticketId: String(ticket._id) });
    emitTicketEvent(auth.tid, { event:"ticket.closed", ticketId: String(ticket._id), customerEmail: ticket.customerEmail, tenantId: auth.tid });
    try {
      await logActivity(req, { action: "ticket.closed", http: 201, meta: { ticketId: String(ticket._id) } });
    } catch (error) {
      /*ignore*/
    }
    res.json({ data: ticket });
  }
);

// reopen
ticketsRouter.post("/:id/reopen",
  requireAuth,
  requirePermission("TICKET_REOPEN"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) });
    if (!ticket) return res.status(404).json({ error: "not_found" });
    if (ticket.status !== "CLOSED") return res.status(400).json({ error: "invalid_status", message: "Only CLOSED tickets can be reopened" });
    ticket.status = "REOPENED";
    await ticket.save();
    emitTicketEvent(auth.tid, { event: "ticket.reopened", ticketId: String(ticket._id) });
    try { await logActivity(req, { action: "ticket.reopened", http: 200, meta: { ticketId: String(ticket._id) } }); } catch {}
    res.json({ data: ticket });
  }
);

// reassign with SLA reset
ticketsRouter.post("/:id/reassign",
  requireAuth,
  requirePermission("TICKET_ASSIGN"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = z.object({ assigneeId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.message });
    const { assigneeId } = parsed.data;

    const ticket = await Ticket.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) });
    if (!ticket) return res.status(404).json({ error: "not_found" });
    if (ticket.status === "CLOSED") return res.status(400).json({ error: "invalid_status", message: "Cannot reassign a CLOSED ticket" });

    const now = new Date();
    // Record assignment history
    if (ticket.assigneeId) {
      if (!ticket.assignmentHistory) ticket.assignmentHistory = [];
      ticket.assignmentHistory.push({
        assigneeId: ticket.assigneeId,
        assignedAt: ticket.updatedAt || ticket.createdAt,
        reassignedAt: now,
      });
    }
    ticket.assigneeId = asObjectId(assigneeId);
    await ticket.save();

    emitTicketEvent(auth.tid, { event: "ticket.reassigned", ticketId: String(ticket._id), newAssigneeId: assigneeId, reassignedAt: now.toISOString() });
    try { await logActivity(req, { action: "ticket.reassigned", http: 200, meta: { ticketId: String(ticket._id), assigneeId } }); } catch {}
    res.json({ data: ticket });
  }
);
