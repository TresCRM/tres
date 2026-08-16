/**
 * @module routes/partners
 * Partner program endpoints.
 * Apply to become a partner, check application status, and view partner dashboard.
 */
import { Router } from "express";
import { z } from "zod";
import { PartnerApplication, Partner } from "../models/Partner";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";

export const partnersRouter = Router();

const ApplyBody = z.object({
  companyName: z.string().min(1).max(200),
  website: z.string().url().optional(),
  description: z.string().max(2000).optional(),
});

/**
 * POST /apply — Submit a partner application.
 */
partnersRouter.post("/apply", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const body = ApplyBody.parse(req.body);
    const userId = asObjectId(auth.sub);
    const tenantId = asObjectId(auth.tid);

    // Check for existing application
    const existing = await PartnerApplication.findOne({ userId });
    if (existing) {
      return res.status(409).json({
        error: "application_exists",
        message: `You already have a ${existing.status.toLowerCase()} application.`,
      });
    }

    const application = await PartnerApplication.create({
      userId,
      tenantId,
      companyName: body.companyName,
      website: body.website,
      description: body.description,
      status: "PENDING",
    });

    return res.status(201).json({
      data: {
        applicationId: String(application._id),
        status: application.status,
      },
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /application — Get my partner application status.
 */
partnersRouter.get("/application", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const application = await PartnerApplication.findOne({
      userId: asObjectId(auth.sub),
    }).lean();

    if (!application) {
      return res.status(404).json({ error: "no_application" });
    }

    return res.json({
      data: {
        applicationId: String(application._id),
        companyName: application.companyName,
        website: application.website,
        description: application.description,
        status: application.status,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /dashboard — Partner dashboard with managed tenants count and earnings summary.
 * Only accessible to approved partners.
 */
partnersRouter.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const partner = await Partner.findOne({
      userId: asObjectId(auth.sub),
      isActive: true,
    }).lean();

    if (!partner) {
      return res.status(403).json({
        error: "not_a_partner",
        message: "You must be an approved partner to access the dashboard.",
      });
    }

    return res.json({
      data: {
        tier: partner.tier,
        revenueSharePercent: partner.revenueSharePercent,
        managedTenants: partner.managedTenantIds.length,
        isActive: partner.isActive,
        createdAt: partner.createdAt,
      },
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});
