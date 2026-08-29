import { Router } from "express";
import { z, ZodError } from "zod";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth";
import { strictLimiter } from "../middlewares/security";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { ChatSession } from "../models/ChatSession";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { emitTicketEvent } from "../events/emitter";

export const chatRouter = Router();

/* ---------- Zod schemas ---------- */

const StartChatBody = z.object({
  tenantSlug: z.string().min(1),
  visitorName: z.string().min(1).max(100),
  visitorEmail: z.string().email().optional(),
  metadata: z.object({
    userAgent: z.string().optional(),
    referrerUrl: z.string().optional(),
    pageUrl: z.string().optional(),
  }).optional(),
});

const VisitorMessageBody = z.object({
  visitorId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

const TransferBody = z.object({
  targetAgentId: z.string().min(1),
});

/* ==========================================================
   PUBLIC (visitor-side) — no JWT, rate-limited
   ========================================================== */

/**
 * POST /start — Start a chat session
 */
chatRouter.post("/start", strictLimiter, async (req, res) => {
  try {
    const body = StartChatBody.parse(req.body);

    const tenant = await Tenant.findOne({ slug: body.tenantSlug, isActive: true }).lean();
    if (!tenant) {
      return res.status(404).json({ error: "not_found", message: "Tenant not found or inactive" });
    }

    const visitorId = randomUUID();

    const session = await ChatSession.create({
      tenantId: tenant._id,
      visitorId,
      visitorName: body.visitorName,
      visitorEmail: body.visitorEmail,
      status: "QUEUED",
      messages: [],
      startedAt: new Date(),
      metadata: body.metadata,
    });

    const queuePosition = await ChatSession.countDocuments({
      tenantId: tenant._id,
      status: "QUEUED",
      createdAt: { $lte: session.createdAt },
    });

    return res.status(201).json({
      sessionId: session._id,
      visitorId,
      queuePosition,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation_error", details: err.issues });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:sessionId/message — Visitor sends a message
 */
chatRouter.post("/:sessionId/message", strictLimiter, async (req, res) => {
  try {
    const body = VisitorMessageBody.parse(req.body);

    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.visitorId !== body.visitorId) {
      return res.status(403).json({ error: "forbidden", message: "Visitor ID does not match session" });
    }

    if (session.status !== "QUEUED" && session.status !== "ACTIVE") {
      return res.status(400).json({ error: "invalid_state", message: "Chat session is not active" });
    }

    session.messages.push({
      sender: "visitor",
      content: body.content,
      timestamp: new Date(),
    });
    await session.save();

    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation_error", details: err.issues });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /:sessionId/messages — Visitor polls for messages
 */
chatRouter.get("/:sessionId/messages", strictLimiter, async (req, res) => {
  try {
    const visitorId = req.query.visitorId as string;
    if (!visitorId) {
      return res.status(400).json({ error: "validation_error", message: "visitorId query param required" });
    }

    const session = await ChatSession.findById(req.params.sessionId).populate("agentId", "firstName lastName");
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.visitorId !== visitorId) {
      return res.status(403).json({ error: "forbidden", message: "Visitor ID does not match session" });
    }

    let messages = session.messages;
    const since = req.query.since as string | undefined;
    if (since) {
      const sinceDate = new Date(since);
      messages = messages.filter((m) => m.timestamp > sinceDate);
    }

    const agent = session.agentId as any;
    const agentName = agent?.firstName ? `${agent.firstName} ${agent.lastName ?? ""}`.trim() : undefined;

    return res.json({
      messages,
      status: session.status,
      agentName,
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ==========================================================
   AUTHENTICATED (agent-side) — JWT required
   ========================================================== */

/**
 * GET /queue — Get chat queue for agent's tenant
 */
chatRouter.get("/queue", requireAuth, async (req, res) => {
  try {
    const { tid } = (req as AuthRequest).auth;
    const tenantId = asObjectId(tid);

    const sessions = await ChatSession.find({ tenantId, status: "QUEUED" })
      .sort({ createdAt: 1 })
      .lean();

    const result = sessions.map((s, idx) => ({
      _id: s._id,
      visitorName: s.visitorName,
      visitorEmail: s.visitorEmail,
      startedAt: s.startedAt,
      queuePosition: idx + 1,
      metadata: s.metadata,
    }));

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:sessionId/accept — Agent accepts a queued chat
 */
chatRouter.post("/:sessionId/accept", requireAuth, async (req, res) => {
  try {
    const { sub, tid } = (req as AuthRequest).auth;

    const session = await ChatSession.findOne({
      _id: asObjectId(req.params.sessionId),
      tenantId: asObjectId(tid),
    });
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.status !== "QUEUED") {
      return res.status(400).json({ error: "invalid_state", message: "Chat session is not queued" });
    }

    session.agentId = asObjectId(sub);
    session.status = "ACTIVE";
    session.messages.push({
      sender: "system",
      content: "Agent has joined the chat",
      timestamp: new Date(),
    });
    await session.save();

    return res.json(session);
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:sessionId/reply — Agent sends a message
 */
chatRouter.post("/:sessionId/reply", requireAuth, async (req, res) => {
  try {
    const content = z.string().min(1).max(5000).parse(req.body.content);
    const { sub, tid } = (req as AuthRequest).auth;

    const session = await ChatSession.findOne({
      _id: asObjectId(req.params.sessionId),
      tenantId: asObjectId(tid),
    });
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "invalid_state", message: "Chat session is not active" });
    }

    session.messages.push({
      sender: "agent",
      content,
      timestamp: new Date(),
    });
    await session.save();

    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation_error", details: err.issues });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:sessionId/transfer — Transfer chat to another agent
 */
chatRouter.post("/:sessionId/transfer", requireAuth, async (req, res) => {
  try {
    const body = TransferBody.parse(req.body);
    const { tid } = (req as AuthRequest).auth;

    const session = await ChatSession.findOne({
      _id: asObjectId(req.params.sessionId),
      tenantId: asObjectId(tid),
    });
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "invalid_state", message: "Chat session is not active" });
    }

    session.agentId = asObjectId(body.targetAgentId);
    session.status = "TRANSFERRED";
    session.messages.push({
      sender: "system",
      content: "Chat transferred to another agent",
      timestamp: new Date(),
    });
    // Immediately set back to ACTIVE for the new agent
    session.status = "ACTIVE";
    await session.save();

    return res.json(session);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation_error", details: err.issues });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:sessionId/end — End chat and create ticket from transcript
 */
chatRouter.post("/:sessionId/end", requireAuth, async (req, res) => {
  try {
    const { sub, tid } = (req as AuthRequest).auth;
    const tenantId = asObjectId(tid);

    const session = await ChatSession.findOne({
      _id: asObjectId(req.params.sessionId),
      tenantId,
    });
    if (!session) {
      return res.status(404).json({ error: "not_found", message: "Chat session not found" });
    }

    if (session.status === "ENDED") {
      return res.status(400).json({ error: "invalid_state", message: "Chat session already ended" });
    }

    session.status = "ENDED";
    session.endedAt = new Date();

    // Build transcript body from messages
    const transcript = session.messages
      .map((m) => {
        const ts = m.timestamp.toISOString();
        const label = m.sender === "visitor" ? session.visitorName : m.sender === "agent" ? "Agent" : "System";
        return `[${ts}] ${label}: ${m.content}`;
      })
      .join("\n");

    // Create ticket from chat transcript
    const agentId = asObjectId(sub);
    const ticket = await Ticket.create({
      tenantId,
      subject: `Chat with ${session.visitorName}`,
      body: transcript,
      customerEmail: session.visitorEmail,
      status: "RESOLVED",
      priority: "LOW",
      createdBy: agentId,
      assigneeId: agentId,
      statusHistory: [{ from: "OPEN", to: "RESOLVED", changedBy: sub, reason: "chat_ended", timestamp: new Date() }],
    });

    // Create comments from each message
    const comments = session.messages.map((m) => ({
      tenantId,
      ticketId: ticket._id,
      authorId: agentId,
      body: `[${m.sender}] ${m.content}`,
      isAgent: m.sender === "agent" || m.sender === "system",
      isInternal: m.sender === "system",
    }));
    if (comments.length > 0) {
      await Comment.insertMany(comments);
    }

    session.ticketId = ticket._id;
    session.messages.push({
      sender: "system",
      content: `Chat ended. Ticket #${ticket._id} created.`,
      timestamp: new Date(),
    });
    await session.save();

    emitTicketEvent(tid, {
      type: "ticket:created",
      ticketId: ticket._id.toString(),
      status: ticket.status,
      subject: ticket.subject,
    });

    return res.json({
      session,
      ticketId: ticket._id,
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});
