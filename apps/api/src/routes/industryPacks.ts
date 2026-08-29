/**
 * @module routes/industryPacks
 * Industry starter pack endpoints.
 * GET routes are public (used during onboarding).
 * POST apply requires auth + SETTINGS_UPDATE permission.
 */
import { Router } from "express";
import { z } from "zod";
import { IndustryPack } from "../models/IndustryPack";
import { TicketTemplate } from "../models/TicketTemplate";
import { SlaPolicy } from "../models/SlaPolicy";
import { INDUSTRY_PACKS } from "../seeds/industryPacks";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";

export const industryPacksRouter = Router();

/**
 * GET / — List all active industry packs (public, no auth).
 * Used on the onboarding screen to let tenants pick their industry.
 */
industryPacksRouter.get("/", async (_req, res) => {
  try {
    let packs = await IndustryPack.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();

    // If no packs in DB yet, return seed data directly
    if (packs.length === 0) {
      return res.json({
        data: INDUSTRY_PACKS.map((p) => ({
          slug: p.slug,
          name: p.name,
          description: p.description,
          icon: p.icon,
          issueTypes: p.issueTypes,
          slaTargets: p.slaTargets,
          sortOrder: p.sortOrder,
        })),
      });
    }

    return res.json({
      data: packs.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        icon: p.icon,
        issueTypes: p.issueTypes,
        slaTargets: p.slaTargets,
        sortOrder: p.sortOrder,
      })),
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /:slug — Get a single industry pack by slug (public).
 */
industryPacksRouter.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    let pack = await IndustryPack.findOne({ slug, isActive: true }).lean();

    // Fallback to seed data if not in DB
    if (!pack) {
      const seedPack = INDUSTRY_PACKS.find((p) => p.slug === slug);
      if (!seedPack) return res.status(404).json({ error: "pack_not_found" });
      return res.json({ data: seedPack });
    }

    return res.json({ data: pack });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /:slug/apply — Apply an industry pack to the authenticated tenant.
 * Creates TicketTemplates from pack.responseTemplates and a SlaPolicy from pack.slaTargets.
 */
industryPacksRouter.post(
  "/:slug/apply",
  requireAuth,
  requirePermission("SETTINGS_UPDATE"),
  async (req, res) => {
    try {
      const auth = (req as AuthRequest).auth;
      const { slug } = req.params;
      const tenantId = asObjectId(auth.tid);
      const userId = asObjectId(auth.sub);

      // Try DB first, then seed data
      let pack = await IndustryPack.findOne({ slug, isActive: true }).lean();
      if (!pack) {
        const seedPack = INDUSTRY_PACKS.find((p) => p.slug === slug);
        if (!seedPack) return res.status(404).json({ error: "pack_not_found" });
        pack = seedPack as any;
      }

      // Create TicketTemplates from response templates
      const templateDocs = pack!.responseTemplates.map((rt, idx) => ({
        tenantId,
        name: rt.name,
        description: `${pack!.name} pack: ${rt.issueType}`,
        issueType: rt.issueType,
        bodyTemplate: `Subject: ${rt.subject}\n\n${rt.body}`,
        isActive: true,
        createdBy: userId,
        sortOrder: idx,
      }));

      const createdTemplates = await TicketTemplate.insertMany(templateDocs);

      // Create SLA policy
      const slaPolicy = await SlaPolicy.create({
        tenantId,
        name: `${pack!.name} Industry Standard`,
        priority: "ALL",
        firstResponseMinutes: pack!.slaTargets.firstResponseMinutes,
        resolutionMinutes: pack!.slaTargets.resolutionMinutes,
        businessHoursOnly: false,
        breachNotifyAssignee: true,
        breachNotifyManager: true,
        isDefault: true,
        isActive: true,
      });

      return res.json({
        data: {
          applied: true,
          templates: createdTemplates.length,
          slaPolicy: String(slaPolicy._id),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: "internal_error", message: e.message });
    }
  }
);
