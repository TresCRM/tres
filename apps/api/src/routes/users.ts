/**
 * @module routes/users
 * User/staff management within a tenant: invite, list, update roles, enable/disable.
 * Enforces seat limits from the subscription plan.
 */
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, requirePermission, requireExactRole } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId, hashPassword } from "../utils/auth";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";
import { sendEmail } from "../services/mailer";
import { ENV } from "../config/env";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { ROLES, isValidRole } from "../../../../packages/types/src/roles";
import type { Role } from "../../../../packages/types/src/roles";

extendZodWithOpenApi(z);

export const usersRouter = Router();

/* ---------- Zod schemas ---------- */

const InviteBody = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roles: z.array(z.string()).min(1).refine(
    (roles) => roles.every(r => isValidRole(r)),
    { message: "Invalid role(s)" }
  ),
});

const UpdateRolesBody = z.object({
  roles: z.array(z.string()).min(1).refine(
    (roles) => roles.every(r => isValidRole(r)),
    { message: "Invalid role(s)" }
  ),
});

const UpdateStatusBody = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

const ListQuery = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(["ACTIVE", "PENDING", "DISABLED"]).optional(),
});

/* ---------- OpenAPI ---------- */

registry.registerPath({
  tags: ["Users"],
  method: "post",
  path: "/api/v1/users/invite",
  description: "Invite a new user to the tenant. Sends a verification email. Enforces seat limits.",
  request: { body: { content: { "application/json": { schema: InviteBody } } } },
  responses: { 201: { description: "Invited" }, 400: { description: "Bad Request" }, 402: { description: "Seat limit reached" }, 409: { description: "Email already exists in tenant" } },
});

registry.registerPath({
  tags: ["Users"],
  method: "get",
  path: "/api/v1/users",
  description: "List users in the tenant with optional status filter.",
  request: { query: ListQuery },
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Users"],
  method: "get",
  path: "/api/v1/users/{id}",
  description: "Get a single user by ID.",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Users"],
  method: "put",
  path: "/api/v1/users/{id}/roles",
  description: "Update user roles. OWNER only.",
  request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateRolesBody } } } },
  responses: { 200: { description: "Updated" }, 403: { description: "Forbidden" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Users"],
  method: "put",
  path: "/api/v1/users/{id}/status",
  description: "Enable or disable a user.",
  request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateStatusBody } } } },
  responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Users"],
  method: "delete",
  path: "/api/v1/users/{id}",
  description: "Remove a user from the tenant. OWNER only. Cannot remove yourself.",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Removed" }, 400: { description: "Cannot remove yourself" }, 404: { description: "Not found" } },
});

/* ---------- Routes ---------- */

// POST invite user
usersRouter.post("/invite", requireAuth, requirePermission("USER_INVITE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = InviteBody.parse(req.body);

    // Check seat limit
    const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) }).lean();
    if (sub) {
      const currentCount = await User.countDocuments({ tenantId: asObjectId(auth.tid), status: { $ne: "DISABLED" } });
      if (currentCount >= sub.seats) {
        return res.status(402).json({ error: "seat_limit_reached", message: `Plan allows ${sub.seats} seats. ${currentCount} in use.` });
      }
    }

    // Check duplicate
    const existing = await User.findOne({ tenantId: asObjectId(auth.tid), email: body.email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "email_exists", message: "This email is already in the tenant" });

    // Create with temp password and pending status
    const tempPassword = crypto.randomBytes(16).toString("hex");
    const token = crypto.randomBytes(24).toString("hex");

    const user = await User.create({
      tenantId: asObjectId(auth.tid),
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email.toLowerCase(),
      passwordHash: await hashPassword(tempPassword),
      roles: body.roles as Role[],
      status: "PENDING",
      emailVerification: { token, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });

    // Send invite email
    if (!ENV.EMAILS_DISABLED) {
      const inviteUrl = `${ENV.FRONTEND_ORIGIN}/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(body.email)}`;
      await sendEmail({
        to: body.email,
        subject: "You've been invited to TRES CRM",
        html: `<p>Hi ${body.firstName},</p><p>You've been invited as ${body.roles.join(", ")}.</p><p><a href="${inviteUrl}">Accept Invitation</a></p>`,
        text: `You've been invited. Accept here: ${inviteUrl}`,
      });
    }

    return res.status(201).json({
      data: { id: user._id, email: user.email, roles: user.roles, status: user.status },
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET list users
usersRouter.get("/", requireAuth, requirePermission("USER_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (q.status) filter.status = q.status;
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };

  const items = await User.find(filter)
    .select("firstName lastName email roles status createdAt")
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean();
  const nextCursor = items.length === q.limit ? String(items[items.length - 1]._id) : undefined;

  // Seat usage
  const sub = await Subscription.findOne({ tenantId: asObjectId(auth.tid) }).lean();
  const activeCount = await User.countDocuments({ tenantId: asObjectId(auth.tid), status: { $ne: "DISABLED" } });

  res.json({ data: items, nextCursor, seats: { used: activeCount, total: sub?.seats || 0 } });
});

// GET single user
usersRouter.get("/:id", requireAuth, requirePermission("USER_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const user = await User.findOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) })
    .select("firstName lastName email roles status createdAt updatedAt")
    .lean();
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({ data: user });
});

// PUT update roles (OWNER only)
usersRouter.put("/:id/roles", requireAuth, requireExactRole("OWNER"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateRolesBody.parse(req.body);

    // Prevent removing OWNER from yourself
    if (req.params.id === auth.sub && !body.roles.includes("OWNER")) {
      return res.status(400).json({ error: "cannot_remove_own_owner", message: "Cannot remove OWNER role from yourself" });
    }

    const user = await User.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { roles: body.roles },
      { new: true }
    ).select("firstName lastName email roles status");
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ data: user });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// PUT update status (enable/disable)
usersRouter.put("/:id/status", requireAuth, requirePermission("USER_DISABLE"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  try {
    const body = UpdateStatusBody.parse(req.body);

    // Cannot disable yourself
    if (req.params.id === auth.sub && body.status === "DISABLED") {
      return res.status(400).json({ error: "cannot_disable_self", message: "Cannot disable your own account" });
    }

    const user = await User.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { status: body.status },
      { new: true }
    ).select("firstName lastName email roles status");
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ data: user });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE remove user (OWNER only)
usersRouter.delete("/:id", requireAuth, requireExactRole("OWNER"), async (req, res) => {
  const auth = (req as AuthRequest).auth;

  // Cannot remove yourself
  if (req.params.id === auth.sub) {
    return res.status(400).json({ error: "cannot_remove_self", message: "Cannot remove your own account" });
  }

  const result = await User.deleteOne({ _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
