/**
 * @module admin/routes/content
 * CMS for website content: pages, policies, FAQs.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Content } from "../../models/Content";
import type { AuthRequest } from "../../types/auth";
import { asObjectId } from "../../utils/auth";

export const adminContentRouter = Router();

adminContentRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  type: z.enum(["PAGE", "ANNOUNCEMENT", "POLICY", "FAQ"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

const CreateBody = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens"),
  title: z.string().min(1).max(500),
  body: z.string().default(""),
  type: z.enum(["PAGE", "ANNOUNCEMENT", "POLICY", "FAQ"]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  meta: z.record(z.string(), z.any()).optional(),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

// GET list content
adminContentRouter.get("/", requireAdminPermission("ADMIN_CONTENT_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.type) filter.type = q.type;
  if (q.status) filter.status = q.status;
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await Content.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});

// GET single content by ID or slug
adminContentRouter.get("/:idOrSlug", requireAdminPermission("ADMIN_CONTENT_READ"), async (req, res) => {
  const { idOrSlug } = req.params;
  let item;
  try {
    item = await Content.findById(asObjectId(idOrSlug)).lean();
  } catch {
    item = await Content.findOne({ slug: idOrSlug }).lean();
  }
  if (!item) return res.status(404).json({ error: "not_found" });
  res.json({ data: item });
});

// POST create content
adminContentRouter.post("/", requireAdminPermission("ADMIN_CONTENT_UPDATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = CreateBody.parse(req.body);
    const existing = await Content.findOne({ slug: body.slug });
    if (existing) return res.status(409).json({ error: "slug_exists", message: "Content with this slug already exists" });

    const item = await Content.create({
      ...body,
      authorId: asObjectId(auth.sub),
      publishedAt: body.status === "PUBLISHED" ? new Date() : null,
    });
    res.status(201).json({ data: item });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// PUT update content
adminContentRouter.put("/:id", requireAdminPermission("ADMIN_CONTENT_UPDATE"), async (req, res) => {
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = { ...body };
    if (body.status === "PUBLISHED") update.publishedAt = new Date();

    const item = await Content.findByIdAndUpdate(
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

// DELETE content
adminContentRouter.delete("/:id", requireAdminPermission("ADMIN_CONTENT_UPDATE"), async (req, res) => {
  const result = await Content.deleteOne({ _id: asObjectId(req.params.id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
