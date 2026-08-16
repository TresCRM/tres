/**
 * @module routes/customRoles
 * CRUD for tenant-scoped custom RBAC roles.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { CustomRole } from "../models/CustomRole";
import { PERMISSIONS } from "../../../../packages/types/src/roles";
import { badRequest } from "../utils/http";
import { logActivity } from "../utils/log";

export const customRolesRouter = Router();

const VALID_PERMISSIONS = new Set<string>(PERMISSIONS);

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1),
  inheritsFrom: z.string().optional(),
});

const UpdateBody = CreateBody.partial();

// GET / — list custom roles for tenant
customRolesRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const roles = await CustomRole.find({
    tenantId: asObjectId(auth.tid),
    isActive: true,
  })
    .sort({ name: 1 })
    .lean();
  res.json({ data: roles });
});

// GET /:id — get single role
customRolesRouter.get("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const role = await CustomRole.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();
  if (!role) return res.status(404).json({ error: "not_found" });
  res.json({ data: role });
});

// POST / — create role
customRolesRouter.post(
  "/",
  requireAuth,
  requirePermission("USER_INVITE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    // Validate permissions against known list
    const invalid = parsed.data.permissions.filter((p) => !VALID_PERMISSIONS.has(p));
    if (invalid.length > 0) {
      return await badRequest(req, res, "invalid_permissions", `Unknown permissions: ${invalid.join(", ")}`);
    }

    try {
      const role = await CustomRole.create({
        ...parsed.data,
        tenantId: auth.tid,
        createdBy: auth.sub,
      });
      try { await logActivity(req, { action: "custom_role.created", http: 201, meta: { roleId: String(role._id) } }); } catch {}
      res.status(201).json({ data: role });
    } catch (err: any) {
      if (err.code === 11000) {
        return await badRequest(req, res, "duplicate_name", "A role with this name already exists in your organization");
      }
      throw err;
    }
  },
);

// PUT /:id — update role
customRolesRouter.put(
  "/:id",
  requireAuth,
  requirePermission("USER_INVITE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    if (parsed.data.permissions) {
      const invalid = parsed.data.permissions.filter((p) => !VALID_PERMISSIONS.has(p));
      if (invalid.length > 0) {
        return await badRequest(req, res, "invalid_permissions", `Unknown permissions: ${invalid.join(", ")}`);
      }
    }

    const role = await CustomRole.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: parsed.data },
      { new: true },
    ).lean();
    if (!role) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "custom_role.updated", http: 200, meta: { roleId: req.params.id } }); } catch {}
    res.json({ data: role });
  },
);

// DELETE /:id — soft delete (isActive=false)
customRolesRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("USER_INVITE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const role = await CustomRole.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: { isActive: false } },
      { new: true },
    ).lean();
    if (!role) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "custom_role.deleted", http: 200, meta: { roleId: req.params.id } }); } catch {}
    res.json({ data: role });
  },
);
