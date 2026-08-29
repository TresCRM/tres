import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { KnowledgeArticle } from "../models/KnowledgeArticle";
import { Tenant } from "../models/Tenant";
import { logActivity } from "../utils/log";
import { Types } from "mongoose";

export const knowledgeRouter = Router();

// ─── Schemas ────────────────────────────────────────

const StatusEnum = z.enum(["AI_DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

const ListQuery = z.object({
  status: StatusEnum.optional(),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const CreateBody = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  body: z.string().min(1),
  status: StatusEnum.optional(),
});

const UpdateBody = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  status: StatusEnum.optional(),
});

// ─── GET / — list articles for tenant ───────────────

knowledgeRouter.get("/", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const q = ListQuery.parse(req.query);

    const filter: any = { tenantId: asObjectId(auth.tid), status: { $ne: "ARCHIVED" } };
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;

    const cursorCond = q.cursor ? { _id: { $lt: new Types.ObjectId(q.cursor) } } : {};
    const items = await KnowledgeArticle.find({ ...filter, ...cursorCond })
      .sort({ _id: -1 })
      .limit(q.limit)
      .lean();

    const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : null;

    return res.json({ data: items, nextCursor });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// ─── GET /public — list PUBLISHED articles (portal) ──

knowledgeRouter.get("/public", async (req, res) => {
  try {
    const { tenantSlug, category, limit: rawLimit, cursor } = req.query;
    if (!tenantSlug || typeof tenantSlug !== "string") {
      return res.status(400).json({ error: "invalid_request", message: "tenantSlug query param is required." });
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug.toLowerCase(), isActive: true }).select("_id").lean();
    if (!tenant) {
      return res.status(404).json({ error: "tenant_not_found" });
    }

    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
    const filter: any = { tenantId: tenant._id, status: "PUBLISHED" };
    if (category && typeof category === "string") filter.category = category;

    const cursorCond = cursor && typeof cursor === "string"
      ? { _id: { $lt: new Types.ObjectId(cursor) } }
      : {};

    const items = await KnowledgeArticle.find({ ...filter, ...cursorCond })
      .sort({ _id: -1 })
      .limit(limit)
      .select("title category body publishedAt viewCount helpfulCount createdAt")
      .lean();

    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;

    return res.json({ data: items, nextCursor });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// ─── GET /:id — get single article ──────────────────

knowledgeRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const article = await KnowledgeArticle.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    }).lean();

    if (!article) {
      return res.status(404).json({ error: "article_not_found" });
    }

    return res.json({ data: article });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

// ─── POST / — create article manually ───────────────

knowledgeRouter.post(
  "/",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const body = CreateBody.parse(req.body);

      const article = await KnowledgeArticle.create({
        tenantId: asObjectId(auth.tid),
        title: body.title,
        category: body.category,
        body: body.body,
        status: body.status || "REVIEW",
        source: "manual",
        publishedAt: body.status === "PUBLISHED" ? new Date() : undefined,
      });

      await logActivity(req, {
        action: "knowledge.create",
        meta: { articleId: article._id, title: body.title },
      });

      return res.status(201).json({ data: article });
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
  }
);

// ─── PUT /:id — update article ──────────────────────

knowledgeRouter.put(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const body = UpdateBody.parse(req.body);

      const article = await KnowledgeArticle.findOne({
        _id: asObjectId(req.params.id),
        tenantId: asObjectId(auth.tid),
      });

      if (!article) {
        return res.status(404).json({ error: "article_not_found" });
      }

      if (body.title !== undefined) article.title = body.title;
      if (body.category !== undefined) article.category = body.category;
      if (body.body !== undefined) article.body = body.body;
      if (body.status !== undefined) {
        const wasPublished = article.status === "PUBLISHED";
        article.status = body.status;
        // Set publishedAt when transitioning to PUBLISHED
        if (body.status === "PUBLISHED" && !wasPublished) {
          article.publishedAt = new Date();
        }
      }

      await article.save();

      await logActivity(req, {
        action: "knowledge.update",
        meta: { articleId: article._id, changes: Object.keys(body) },
      });

      return res.json({ data: article });
    } catch (e: any) {
      if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
  }
);

// ─── DELETE /:id — archive article ──────────────────

knowledgeRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;

      const article = await KnowledgeArticle.findOneAndUpdate(
        { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
        { status: "ARCHIVED" },
        { new: true }
      );

      if (!article) {
        return res.status(404).json({ error: "article_not_found" });
      }

      await logActivity(req, {
        action: "knowledge.archive",
        meta: { articleId: article._id },
      });

      return res.json({ data: article });
    } catch (e: any) {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
  }
);

// ─── POST /:id/helpful — increment helpful count ───

knowledgeRouter.post("/:id/helpful", async (req, res) => {
  try {
    const article = await KnowledgeArticle.findOneAndUpdate(
      { _id: asObjectId(req.params.id), status: "PUBLISHED" },
      { $inc: { helpfulCount: 1 } },
      { new: true }
    );

    if (!article) {
      return res.status(404).json({ error: "article_not_found" });
    }

    return res.json({ data: { helpfulCount: article.helpfulCount } });
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});
