import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { TicketTemplate } from "../models/TicketTemplate";
import { requireActiveSubscription } from "../middlewares/subscriptionGuard";
import { logActivity } from "../utils/log";
import { badRequest } from "../utils/http";

export const ticketTemplatesRouter = Router();

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  issueType: z.string().max(100).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  defaultTags: z.array(z.string()).optional(),
  bodyTemplate: z.string().max(5000).optional(),
  sortOrder: z.number().optional(),
});

const UpdateBody = CreateBody.partial().extend({
  isActive: z.boolean().optional(),
});

const ListQuery = z.object({
  issueType: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// GET / — list templates
ticketTemplatesRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (q.issueType) filter.issueType = q.issueType;
  if (q.isActive !== undefined) filter.isActive = q.isActive;
  else filter.isActive = true; // default: only active

  const items = await TicketTemplate.find(filter)
    .sort({ sortOrder: 1, createdAt: -1 })
    .limit(q.limit)
    .lean();
  res.json({ data: items });
});

// GET /:id
ticketTemplatesRouter.get("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const tmpl = await TicketTemplate.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();
  if (!tmpl) return res.status(404).json({ error: "not_found" });
  res.json({ data: tmpl });
});

// POST / — create
ticketTemplatesRouter.post(
  "/",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }
    const tmpl = await TicketTemplate.create({
      ...parsed.data,
      tenantId: auth.tid,
      createdBy: auth.sub,
    });
    try { await logActivity(req, { action: "template.created", http: 201, meta: { templateId: String(tmpl._id) } }); } catch {}
    res.status(201).json({ data: tmpl });
  }
);

// PUT /:id — update
ticketTemplatesRouter.put(
  "/:id",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  requireActiveSubscription({ write: true }),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }
    const tmpl = await TicketTemplate.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      parsed.data,
      { new: true }
    );
    if (!tmpl) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "template.updated", http: 200, meta: { templateId: String(tmpl._id) } }); } catch {}
    res.json({ data: tmpl });
  }
);

// DELETE /:id — soft delete
ticketTemplatesRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const tmpl = await TicketTemplate.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { isActive: false },
      { new: true }
    );
    if (!tmpl) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "template.deleted", http: 200, meta: { templateId: String(tmpl._id) } }); } catch {}
    res.json({ data: tmpl });
  }
);
