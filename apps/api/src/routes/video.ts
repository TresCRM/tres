/**
 * @module routes/video
 * Video session management — create, consent, start, end, list.
 * All routes require authentication; sessions are tenant-scoped.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { VideoSession } from "../models/VideoSession";
import { asObjectId } from "../utils/auth";
import type { AuthPayload } from "../types/auth";

export const videoRouter = Router();

videoRouter.use(requireAuth);

/* ---------- POST /sessions — create a new video session ---------- */
videoRouter.post("/sessions", async (req, res) => {
  const auth = (req as any).auth as AuthPayload;
  const body = z
    .object({
      ticketId: z.string().optional(),
      chatSessionId: z.string().optional(),
    })
    .parse(req.body);

  const session = await VideoSession.create({
    tenantId: asObjectId(auth.tid),
    agentId: asObjectId(auth.sub),
    ticketId: body.ticketId ? asObjectId(body.ticketId) : undefined,
    chatSessionId: body.chatSessionId ? asObjectId(body.chatSessionId) : undefined,
    status: "INITIATED",
  });

  res.status(201).json({ data: session });
});

/* ---------- PUT /sessions/:id/consent — record customer consent ---------- */
videoRouter.put("/sessions/:id/consent", async (req, res) => {
  const auth = (req as any).auth as AuthPayload;

  const session = await VideoSession.findOneAndUpdate(
    { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
    { consentGiven: true },
    { new: true }
  );

  if (!session) {
    return res.status(404).json({ error: "not_found", message: "Video session not found" });
  }

  res.json({ data: session });
});

/* ---------- PUT /sessions/:id/start — start the video session ---------- */
videoRouter.put("/sessions/:id/start", async (req, res) => {
  const auth = (req as any).auth as AuthPayload;

  const session = await VideoSession.findOneAndUpdate(
    { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
    { status: "ACTIVE", startedAt: new Date() },
    { new: true }
  );

  if (!session) {
    return res.status(404).json({ error: "not_found", message: "Video session not found" });
  }

  res.json({ data: session });
});

/* ---------- PUT /sessions/:id/end — end the video session ---------- */
videoRouter.put("/sessions/:id/end", async (req, res) => {
  const auth = (req as any).auth as AuthPayload;

  const session = await VideoSession.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  });

  if (!session) {
    return res.status(404).json({ error: "not_found", message: "Video session not found" });
  }

  const now = new Date();
  session.status = "ENDED";
  session.endedAt = now;

  // Calculate duration in seconds if startedAt is available
  if (session.startedAt) {
    session.duration = Math.round((now.getTime() - session.startedAt.getTime()) / 1000);
  }

  await session.save();

  res.json({ data: session });
});

/* ---------- GET /sessions — list sessions for tenant (cursor pagination) ---------- */
videoRouter.get("/sessions", async (req, res) => {
  const auth = (req as any).auth as AuthPayload;

  const query = z
    .object({
      limit: z.coerce.number().min(1).max(100).default(25),
      cursor: z.string().optional(),
      status: z.enum(["INITIATED", "RINGING", "ACTIVE", "ENDED"]).optional(),
    })
    .parse(req.query);

  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (query.status) filter.status = query.status;
  if (query.cursor) filter._id = { $lt: asObjectId(query.cursor) };

  const items = await VideoSession.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit)
    .lean();

  const nextCursor =
    items.length === query.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});
