/**
 * @module admin/routes/tickets
 * Cross-tenant ticket oversight: list, view, escalate.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { Ticket } from "../../models/Ticket";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Comment } from "../../models/Comment";
import { asObjectId } from "../../utils/auth";
import type { AuthRequest } from "../../types/auth";

export const adminTicketsRouter = Router();

adminTicketsRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["OPEN", "CLOSED", "PENDING"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  tenantId: z.string().optional(),
  q: z.string().optional(),
});

// GET list tickets cross-tenant
adminTicketsRouter.get("/", requireAdminPermission("ADMIN_TICKET_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.tenantId) filter.tenantId = asObjectId(q.tenantId);
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  if (q.q) {
    filter.$or = [
      { subject: { $regex: q.q, $options: "i" } },
      { "customer.email": { $regex: q.q, $options: "i" } },
    ];
  }

  const items = await Ticket.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  // Enrich with tenant info
  const tenantIds = [...new Set(items.map(t => String(t.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds.map(id => asObjectId(id)) } })
    .select("slug branding.name")
    .lean();
  const tenantMap = Object.fromEntries(tenants.map(t => [String(t._id), t]));

  const enriched = items.map(t => ({
    ...t,
    tenant: tenantMap[String(t.tenantId)] || null,
  }));

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: enriched, nextCursor });
});

// GET single ticket with comments
adminTicketsRouter.get("/:id", requireAdminPermission("ADMIN_TICKET_READ"), async (req, res) => {
  const ticket = await Ticket.findById(asObjectId(req.params.id)).lean();
  if (!ticket) return res.status(404).json({ error: "not_found" });

  const [tenant, comments] = await Promise.all([
    Tenant.findById(ticket.tenantId).select("slug branding.name").lean(),
    Comment.find({ ticketId: ticket._id }).sort({ createdAt: 1 }).lean(),
  ]);

  res.json({ data: { ...ticket, tenant, comments } });
});

// POST escalate ticket (set priority to URGENT + add internal note)
adminTicketsRouter.post("/:id/escalate", requireAdminPermission("ADMIN_TICKET_ESCALATE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const { reason } = req.body;

  const ticket = await Ticket.findByIdAndUpdate(
    asObjectId(req.params.id),
    { $set: { priority: "URGENT" } },
    { new: true }
  ).lean();
  if (!ticket) return res.status(404).json({ error: "not_found" });

  // Add escalation comment
  await Comment.create({
    ticketId: ticket._id,
    tenantId: ticket.tenantId,
    authorId: asObjectId(auth.sub),
    body: `[ESCALATED by platform admin] ${reason || "Priority escalation"}`,
    isInternal: true,
  });

  res.json({ data: ticket });
});
