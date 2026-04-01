/**
 * @module admin/routes/announcements
 * System announcements management: CRUD with scheduling.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Announcement } from "../../models/Announcement";
import type { AuthRequest } from "../../types/auth";
import { asObjectId } from "../../utils/auth";

export const adminAnnouncementsRouter = Router();

adminAnnouncementsRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  level: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
});

const CreateBody = z.object({
  title: z.string().min(1).max(500),
  body: z.string().default(""),
  level: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  targetRoles: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().optional(),
  level: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  targetRoles: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// GET list announcements
adminAnnouncementsRouter.get("/", requireAdminPermission("ADMIN_ANNOUNCEMENT_CREATE"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.isActive !== undefined) filter.isActive = q.isActive === "true";
  if (q.level) filter.level = q.level;
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await Announcement.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});

// GET active announcements (public-facing)
adminAnnouncementsRouter.get("/active", async (_req, res) => {
  const now = new Date();
  const items = await Announcement.find({
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  })
    .sort({ level: -1, startsAt: -1 })
    .limit(10)
    .lean();

  res.json({ data: items });
});

// POST create announcement
adminAnnouncementsRouter.post("/", requireAdminPermission("ADMIN_ANNOUNCEMENT_CREATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = CreateBody.parse(req.body);
    const item = await Announcement.create({
      ...body,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      authorId: asObjectId(auth.sub),
    });
    res.status(201).json({ data: item });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// PUT update announcement
adminAnnouncementsRouter.put("/:id", requireAdminPermission("ADMIN_ANNOUNCEMENT_CREATE"), async (req, res) => {
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = { ...body };
    if (body.startsAt) update.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) update.endsAt = body.endsAt ? new Date(body.endsAt) : null;

    const item = await Announcement.findByIdAndUpdate(
      asObjectId(req.params.id),
      { $set: update },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json({ error: "not_found" });
    res.json({ data: item });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE announcement
adminAnnouncementsRouter.delete("/:id", requireAdminPermission("ADMIN_ANNOUNCEMENT_CREATE"), async (req, res) => {
  const result = await Announcement.deleteOne({ _id: asObjectId(req.params.id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
