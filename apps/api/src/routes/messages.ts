import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { requireActiveSubscription } from "../middlewares/subscriptionGuard";
import { logActivity } from "../utils/log";
import { badRequest } from "../utils/http";
import { Types } from "mongoose";
import { Message } from "../models/Message";

export const messagesRouter = Router();

/* ---------- schemas ---------- */

const SendMessageBody = z.object({
  type: z.enum(["DIRECT", "CHANNEL", "TICKET_NOTE"]),
  recipientId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  channelName: z.string().min(1).max(100).optional(),
  ticketId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  content: z.string().min(1).max(5000),
});

const EditMessageBody = z.object({
  content: z.string().min(1).max(5000),
});

const CursorQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

/* ---------- helpers ---------- */

/** Extract @mentions from content — matches ObjectId-shaped hex strings */
function extractMentions(content: string): Types.ObjectId[] {
  const regex = /@([a-f0-9]{24})/g;
  const ids: Types.ObjectId[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    ids.push(new Types.ObjectId(match[1]));
  }
  return ids;
}

/* ---------- routes ---------- */

// POST / — Send a message
messagesRouter.post(
  "/",
  requireAuth,
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    try {
      const parsed = SendMessageBody.safeParse(req.body);
      if (!parsed.success) {
        return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
      }
      const body = parsed.data;

      // Validate type-specific required fields
      if (body.type === "DIRECT" && !body.recipientId) {
        return await badRequest(req, res, "invalid_request", "recipientId is required for DIRECT messages");
      }
      if (body.type === "CHANNEL" && !body.channelName) {
        return await badRequest(req, res, "invalid_request", "channelName is required for CHANNEL messages");
      }
      if (body.type === "TICKET_NOTE" && !body.ticketId) {
        return await badRequest(req, res, "invalid_request", "ticketId is required for TICKET_NOTE messages");
      }

      const mentions = extractMentions(body.content);

      const message = await Message.create({
        tenantId: asObjectId(auth.tid),
        type: body.type,
        senderId: asObjectId(auth.sub),
        recipientId: body.recipientId ? asObjectId(body.recipientId) : undefined,
        channelName: body.channelName,
        ticketId: body.ticketId ? asObjectId(body.ticketId) : undefined,
        content: body.content,
        mentions,
      });

      await logActivity(req, { action: "message.send", meta: { messageId: String(message._id), type: body.type } });

      return res.status(201).json({ data: message });
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
  }
);

// GET /direct/:userId — Get DM conversation with a user
messagesRouter.get("/direct/:userId", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const q = CursorQuery.parse(req.query);
    const myId = asObjectId(auth.sub);
    const otherId = asObjectId(req.params.userId);

    const cursorCond = q.cursor ? { _id: { $lt: new Types.ObjectId(q.cursor) } } : {};
    const items = await Message.find({
      tenantId: asObjectId(auth.tid),
      type: "DIRECT",
      isDeleted: false,
      $or: [
        { senderId: myId, recipientId: otherId },
        { senderId: otherId, recipientId: myId },
      ],
      ...cursorCond,
    })
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .lean();

    const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
    return res.json({ data: items, nextCursor });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// GET /channels/:channelName — Get channel messages
messagesRouter.get("/channels/:channelName", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const q = CursorQuery.parse(req.query);

    const cursorCond = q.cursor ? { _id: { $lt: new Types.ObjectId(q.cursor) } } : {};
    const items = await Message.find({
      tenantId: asObjectId(auth.tid),
      type: "CHANNEL",
      channelName: req.params.channelName,
      isDeleted: false,
      ...cursorCond,
    })
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .lean();

    const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
    return res.json({ data: items, nextCursor });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// GET /ticket/:ticketId — Get internal notes for a ticket
messagesRouter.get("/ticket/:ticketId", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const q = CursorQuery.parse(req.query);

    const cursorCond = q.cursor ? { _id: { $lt: new Types.ObjectId(q.cursor) } } : {};
    const items = await Message.find({
      tenantId: asObjectId(auth.tid),
      type: "TICKET_NOTE",
      ticketId: asObjectId(req.params.ticketId),
      isDeleted: false,
      ...cursorCond,
    })
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .lean();

    const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;
    return res.json({ data: items, nextCursor });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// PUT /:id — Edit own message (within 5 minutes)
messagesRouter.put("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const parsed = EditMessageBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", z.treeifyError(parsed.error));
    }
    const body = parsed.data;

    const message = await Message.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
      isDeleted: false,
    });
    if (!message) return res.status(404).json({ error: "not_found" });

    if (String(message.senderId) !== auth.sub) {
      return res.status(403).json({ error: "forbidden", message: "You can only edit your own messages" });
    }

    const fiveMinutesMs = 5 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > fiveMinutesMs) {
      return res.status(400).json({ error: "edit_window_expired", message: "Messages can only be edited within 5 minutes of sending" });
    }

    const mentions = extractMentions(body.content);

    message.content = body.content;
    message.mentions = mentions;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await logActivity(req, { action: "message.edit", meta: { messageId: String(message._id) } });

    return res.json({ data: message });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// DELETE /:id — Soft-delete own message
messagesRouter.delete("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const message = await Message.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
      isDeleted: false,
    });
    if (!message) return res.status(404).json({ error: "not_found" });

    if (String(message.senderId) !== auth.sub) {
      return res.status(403).json({ error: "forbidden", message: "You can only delete your own messages" });
    }

    message.isDeleted = true;
    await message.save();

    await logActivity(req, { action: "message.delete", meta: { messageId: String(message._id) } });

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// POST /:id/read — Mark message as read
messagesRouter.post("/:id/read", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const message = await Message.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
      isDeleted: false,
    });
    if (!message) return res.status(404).json({ error: "not_found" });

    // Avoid duplicate readBy entries
    const alreadyRead = message.readBy.some((r) => String(r.userId) === auth.sub);
    if (!alreadyRead) {
      message.readBy.push({ userId: asObjectId(auth.sub), readAt: new Date() });
      await message.save();
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// GET /unread — Get unread counts
messagesRouter.get("/unread", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const myId = asObjectId(auth.sub);
    const tenantId = asObjectId(auth.tid);

    const [direct, channels, ticketNotes] = await Promise.all([
      // Direct messages sent TO me that I haven't read
      Message.countDocuments({
        tenantId,
        type: "DIRECT",
        recipientId: myId,
        isDeleted: false,
        "readBy.userId": { $ne: myId },
      }),
      // Channel messages in my tenant that I haven't read
      Message.countDocuments({
        tenantId,
        type: "CHANNEL",
        senderId: { $ne: myId },
        isDeleted: false,
        "readBy.userId": { $ne: myId },
      }),
      // Ticket notes in my tenant that I haven't read
      Message.countDocuments({
        tenantId,
        type: "TICKET_NOTE",
        senderId: { $ne: myId },
        isDeleted: false,
        "readBy.userId": { $ne: myId },
      }),
    ]);

    return res.json({ data: { direct, channels, ticketNotes } });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});
