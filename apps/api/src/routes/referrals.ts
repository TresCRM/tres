/**
 * @module routes/referrals
 * Referral program endpoints.
 * Authenticated users can generate referral codes and view stats.
 * Public claim endpoint is used during signup.
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { Referral } from "../models/Referral";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";

export const referralsRouter = Router();

/**
 * POST /generate — Generate a new referral code.
 * Creates a PENDING referral that expires in 30 days.
 */
referralsRouter.post("/generate", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const referralCode = `REF-${randomBytes(6).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const referral = await Referral.create({
      referrerId: asObjectId(auth.sub),
      referrerTenantId: asObjectId(auth.tid),
      referralCode,
      status: "PENDING",
      rewardType: "CREDIT",
      referrerRewarded: false,
      referredRewarded: false,
      expiresAt,
    });

    return res.status(201).json({
      data: {
        referralCode: referral.referralCode,
        expiresAt: referral.expiresAt,
      },
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET / — List my referrals.
 */
referralsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const referrals = await Referral.find({ referrerId: asObjectId(auth.sub) })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ data: referrals });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /stats — Referral statistics for the authenticated user.
 */
referralsRouter.get("/stats", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthRequest).auth;
    const referrerId = asObjectId(auth.sub);

    const [total, signedUp, activated, rewarded] = await Promise.all([
      Referral.countDocuments({ referrerId }),
      Referral.countDocuments({ referrerId, status: "SIGNED_UP" }),
      Referral.countDocuments({ referrerId, status: "ACTIVATED" }),
      Referral.countDocuments({ referrerId, status: "REWARDED" }),
    ]);

    return res.json({
      data: { total, signedUp, activated, rewarded },
    });
  } catch {
    return res.status(500).json({ error: "internal_error" });
  }
});

const ClaimBody = z.object({
  referralCode: z.string().min(1),
  email: z.string().email(),
});

/**
 * POST /claim — Claim a referral code (public, called during signup).
 * Updates referral status to SIGNED_UP and records the referred email.
 */
referralsRouter.post("/claim", async (req, res) => {
  try {
    const body = ClaimBody.parse(req.body);

    const referral = await Referral.findOne({
      referralCode: body.referralCode,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    });

    if (!referral) {
      return res.status(404).json({ error: "invalid_or_expired_referral" });
    }

    referral.status = "SIGNED_UP";
    referral.referredEmail = body.email.toLowerCase();
    await referral.save();

    return res.json({
      data: {
        claimed: true,
        referralCode: referral.referralCode,
      },
    });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.message });
    return res.status(500).json({ error: "internal_error" });
  }
});
