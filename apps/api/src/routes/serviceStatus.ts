/**
 * @module routes/serviceStatus
 * Service status page & incident management.
 * Public: GET /public/:tenantSlug (rate-limited)
 * Authenticated: GET /, PUT /, POST /incidents, POST /incidents/:index/update
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import { strictLimiter } from "../middlewares/security";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { ServiceStatus } from "../models/ServiceStatus";
import { Tenant } from "../models/Tenant";

export const serviceStatusRouter = Router();

/* ---------- Zod schemas ---------- */

const UpdateStatusBody = z.object({
  status: z.enum(["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"]),
  title: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  components: z.array(z.object({
    name: z.string().min(1).max(100),
    status: z.enum(["OPERATIONAL", "DEGRADED", "DOWN"]),
  })).optional(),
});

const CreateIncidentBody = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]).optional(),
  message: z.string().min(1).max(5000),
});

const IncidentUpdateBody = z.object({
  message: z.string().min(1).max(5000),
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]),
});

/* ==========================================================
   PUBLIC — rate-limited, no auth
   ========================================================== */

/**
 * GET /public/:tenantSlug — public status page data
 */
serviceStatusRouter.get("/public/:tenantSlug", strictLimiter, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.tenantSlug.toLowerCase(), isActive: true }).lean();
    if (!tenant) return res.status(404).json({ error: "not_found", message: "Tenant not found" });

    const serviceStatus = await ServiceStatus.findOne({ tenantId: tenant._id }).lean();
    if (!serviceStatus) {
      return res.json({
        data: {
          status: "OPERATIONAL",
          title: "All Systems Operational",
          components: [],
          incidents: [],
          tenantName: tenant.branding.name,
          tenant: {
            name: tenant.branding.name,
            primaryColor: tenant.branding.primaryColor,
            surfaceColor: tenant.branding.surfaceColor,
            logoUrl: tenant.branding.logoUrl,
          },
        },
      });
    }

    // Filter to only active (non-resolved) incidents for public view
    const activeIncidents = (serviceStatus.incidents || []).filter(
      (inc) => inc.status !== "RESOLVED"
    );

    return res.json({
      data: {
        status: serviceStatus.status,
        title: serviceStatus.title,
        message: serviceStatus.message,
        components: serviceStatus.components,
        incidents: activeIncidents,
        tenantName: tenant.branding.name,
        tenant: {
          name: tenant.branding.name,
          primaryColor: tenant.branding.primaryColor,
          surfaceColor: tenant.branding.surfaceColor,
          logoUrl: tenant.branding.logoUrl,
        },
        updatedAt: serviceStatus.updatedAt,
      },
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ==========================================================
   AUTHENTICATED — admin/owner
   ========================================================== */

/**
 * GET / — full status with all incidents (including resolved)
 */
serviceStatusRouter.get("/", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const serviceStatus = await ServiceStatus.findOne({ tenantId: asObjectId(auth.tid) }).lean();
    if (!serviceStatus) {
      return res.json({
        data: {
          status: "OPERATIONAL",
          title: "All Systems Operational",
          components: [],
          incidents: [],
        },
      });
    }
    return res.json({ data: serviceStatus });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PUT / — update overall status (upsert)
 */
serviceStatusRouter.put("/", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const body = UpdateStatusBody.parse(req.body);

    const serviceStatus = await ServiceStatus.findOneAndUpdate(
      { tenantId: asObjectId(auth.tid) },
      {
        $set: {
          status: body.status,
          title: body.title,
          message: body.message,
          ...(body.components ? { components: body.components } : {}),
          updatedBy: asObjectId(auth.sub),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ data: serviceStatus });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /incidents — create a new incident
 */
serviceStatusRouter.post("/incidents", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const body = CreateIncidentBody.parse(req.body);

    const incident = {
      title: body.title,
      status: body.status || "INVESTIGATING",
      updates: [{ message: body.message, status: body.status || "INVESTIGATING", createdAt: new Date() }],
      startedAt: new Date(),
    };

    const serviceStatus = await ServiceStatus.findOneAndUpdate(
      { tenantId: asObjectId(auth.tid) },
      {
        $push: { incidents: incident },
        $set: { updatedBy: asObjectId(auth.sub) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(201).json({
      data: {
        incident: serviceStatus.incidents[serviceStatus.incidents.length - 1],
        index: serviceStatus.incidents.length - 1,
      },
    });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /incidents/:index/update — add an update to an incident by array index
 */
serviceStatusRouter.post("/incidents/:index/update", requireAuth, requirePermission("SETTINGS_UPDATE"), async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const body = IncidentUpdateBody.parse(req.body);
    const index = parseInt(req.params.index, 10);

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: "invalid_request", message: "Invalid incident index" });
    }

    const serviceStatus = await ServiceStatus.findOne({ tenantId: asObjectId(auth.tid) });
    if (!serviceStatus) return res.status(404).json({ error: "not_found", message: "Service status not found" });

    if (index >= serviceStatus.incidents.length) {
      return res.status(404).json({ error: "not_found", message: "Incident not found at given index" });
    }

    serviceStatus.incidents[index].updates.push({
      message: body.message,
      status: body.status,
      createdAt: new Date(),
    });
    serviceStatus.incidents[index].status = body.status;

    if (body.status === "RESOLVED") {
      serviceStatus.incidents[index].resolvedAt = new Date();
    }

    serviceStatus.updatedBy = asObjectId(auth.sub);
    await serviceStatus.save();

    return res.json({ data: { incident: serviceStatus.incidents[index] } });
  } catch (e: any) {
    if (e.name === "ZodError") {
      return res.status(400).json({ error: "invalid_request", details: e.message });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});
