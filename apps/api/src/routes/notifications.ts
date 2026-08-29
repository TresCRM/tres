/**
 * @module routes/notifications
 * Notification management: list, unread count, mark read.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Notification } from "../models/Notification";

export const notificationsRouter = Router();

const ListQuery = z.object({
  isRead: z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : undefined),
    z.boolean().optional(),
  ),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/* ---------- Routes ---------- */

// GET / — list notifications for current user (cursor pagination)
notificationsRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const { isRead, limit, cursor } = ListQuery.parse(req.query);

    const filter: Record<string, unknown> = {
      tenantId: asObjectId(auth.tid),
      userId: asObjectId(auth.sub),
    };
    if (isRead !== undefined) filter.isRead = isRead;
    if (cursor) filter._id = { $lt: asObjectId(cursor) };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const nextCursor =
      notifications.length === limit
        ? notifications[notifications.length - 1]._id.toHexString()
        : null;

    return res.json({ data: notifications, cursor: nextCursor });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET /unread-count — count unread notifications
notificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const count = await Notification.countDocuments({
    tenantId: asObjectId(auth.tid),
    userId: asObjectId(auth.sub),
    isRead: false,
  });
  return res.json({ count });
});

// POST /:id/read — mark a single notification as read
notificationsRouter.post("/:id/read", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const notification = await Notification.findOneAndUpdate(
    {
      _id: asObjectId(req.params.id),
      userId: asObjectId(auth.sub),
    },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  ).lean();

  if (!notification) return res.status(404).json({ error: "not_found" });
  return res.json({ data: notification });
});

// POST /read-all — mark all unread notifications as read
notificationsRouter.post("/read-all", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await Notification.updateMany(
    {
      tenantId: asObjectId(auth.tid),
      userId: asObjectId(auth.sub),
      isRead: false,
    },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return res.json({ updated: result.modifiedCount });
});
