/**
 * @module admin/routes/users
 * Cross-tenant user management: search, view, update status.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, requireAdminPermission, adminAudit } from "../middleware";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { asObjectId } from "../../utils/auth";
import { isValidRole } from "../../../../../packages/types/src/roles";
import type { Role } from "../../../../../packages/types/src/roles";

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAdminAuth, adminAudit);

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["ACTIVE", "PENDING", "DISABLED"]).optional(),
  role: z.string().optional(),
  tenantId: z.string().optional(),
  q: z.string().optional(),
});

const UpdateBody = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  roles: z.array(z.string()).min(1).refine(
    (roles) => roles.every(r => isValidRole(r)),
    { message: "Invalid role(s)" }
  ).optional(),
});

// GET list users cross-tenant
adminUsersRouter.get("/", requireAdminPermission("ADMIN_USER_READ"), async (req, res) => {
  const q = ListQuery.parse(req.query);
  const filter: any = {};
  if (q.status) filter.status = q.status;
  if (q.role) filter.roles = q.role;
  if (q.tenantId) filter.tenantId = asObjectId(q.tenantId);
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  if (q.q) {
    filter.$or = [
      { email: { $regex: q.q, $options: "i" } },
      { firstName: { $regex: q.q, $options: "i" } },
      { lastName: { $regex: q.q, $options: "i" } },
    ];
  }

  const items = await User.find(filter)
    .select("firstName lastName email roles status tenantId createdAt")
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();

  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  res.json({ data: items, nextCursor });
});

// GET single user with tenant info
adminUsersRouter.get("/:id", requireAdminPermission("ADMIN_USER_READ"), async (req, res) => {
  const user = await User.findById(asObjectId(req.params.id))
    .select("firstName lastName email roles status tenantId createdAt updatedAt mfa.enabled")
    .lean();
  if (!user) return res.status(404).json({ error: "not_found" });

  const tenant = await Tenant.findById(user.tenantId).select("slug branding.name plan").lean();

  res.json({ data: { ...user, tenant } });
});

// PUT update user (status/roles)
adminUsersRouter.put("/:id", requireAdminPermission("ADMIN_USER_UPDATE"), async (req, res) => {
  try {
    const body = UpdateBody.parse(req.body);
    const update: any = {};
    if (body.status) update.status = body.status;
    if (body.roles) update.roles = body.roles;

    const user = await User.findByIdAndUpdate(
      asObjectId(req.params.id),
      { $set: update },
      { new: true }
    ).select("firstName lastName email roles status tenantId");
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ data: user });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});
