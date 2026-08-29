/**
 * @module routes/customFields
 * CRUD for tenant-scoped custom field definitions (for Tickets and Customers).
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import {
  CustomFieldDefinition,
  ENTITY_TYPES,
  FIELD_TYPES,
} from "../models/CustomFieldDefinition";
import { badRequest } from "../utils/http";
import { logActivity } from "../utils/log";

export const customFieldsRouter = Router();

const TYPES_REQUIRING_OPTIONS = new Set(["DROPDOWN", "MULTI_SELECT"]);

const CreateBody = z.object({
  entityType: z.enum(ENTITY_TYPES as unknown as [string, ...string[]]),
  issueType: z.string().max(100).optional(),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_]+$/, "Name must be alphanumeric with underscores only"),
  label: z.string().min(1).max(200),
  type: z.enum(FIELD_TYPES as unknown as [string, ...string[]]),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  defaultValue: z.any().optional(),
  placeholder: z.string().max(300).optional(),
  sortOrder: z.number().int().optional(),
});

const UpdateBody = CreateBody.partial();

// GET / — list field definitions
customFieldsRouter.get("/", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  } else {
    filter.isActive = true;
  }

  const fields = await CustomFieldDefinition.find(filter)
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  res.json({ data: fields });
});

// GET /:id — get single definition
customFieldsRouter.get("/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const field = await CustomFieldDefinition.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();
  if (!field) return res.status(404).json({ error: "not_found" });
  res.json({ data: field });
});

// POST / — create field definition
customFieldsRouter.post(
  "/",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    // Options required for DROPDOWN / MULTI_SELECT
    if (TYPES_REQUIRING_OPTIONS.has(parsed.data.type) && (!parsed.data.options || parsed.data.options.length === 0)) {
      return await badRequest(req, res, "invalid_request", `options are required for ${parsed.data.type} fields`);
    }

    try {
      const field = await CustomFieldDefinition.create({
        ...parsed.data,
        tenantId: auth.tid,
      });
      try { await logActivity(req, { action: "custom_field.created", http: 201, meta: { fieldId: String(field._id) } }); } catch {}
      res.status(201).json({ data: field });
    } catch (err: any) {
      if (err.code === 11000) {
        return await badRequest(req, res, "duplicate_name", "A custom field with this name already exists");
      }
      throw err;
    }
  },
);

// PUT /:id — update definition
customFieldsRouter.put(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      return await badRequest(req, res, "invalid_request", "Validation error", parsed.error);
    }

    // If changing type to one that requires options, validate
    if (parsed.data.type && TYPES_REQUIRING_OPTIONS.has(parsed.data.type)) {
      if (parsed.data.options !== undefined && parsed.data.options.length === 0) {
        return await badRequest(req, res, "invalid_request", `options are required for ${parsed.data.type} fields`);
      }
    }

    const field = await CustomFieldDefinition.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: parsed.data },
      { new: true },
    ).lean();
    if (!field) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "custom_field.updated", http: 200, meta: { fieldId: req.params.id } }); } catch {}
    res.json({ data: field });
  },
);

// DELETE /:id — soft delete (isActive=false)
customFieldsRouter.delete(
  "/:id",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const field = await CustomFieldDefinition.findOneAndUpdate(
      { _id: asObjectId(req.params.id), tenantId: asObjectId(auth.tid) },
      { $set: { isActive: false } },
      { new: true },
    ).lean();
    if (!field) return res.status(404).json({ error: "not_found" });
    try { await logActivity(req, { action: "custom_field.deleted", http: 200, meta: { fieldId: req.params.id } }); } catch {}
    res.json({ data: field });
  },
);
