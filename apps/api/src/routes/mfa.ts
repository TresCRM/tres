/**
 * @module routes/mfa
 * Multi-Factor Authentication (TOTP) endpoints.
 * - POST /setup    — generate secret + QR code
 * - POST /verify   — verify TOTP and enable MFA
 * - POST /disable  — disable MFA (requires TOTP or recovery code)
 * - GET  /status   — check MFA status
 */
import { Router } from "express";
import { z } from "zod";
import * as QRCode from "qrcode";
import crypto from "crypto";
import { generateSecret, verifyTOTP, buildOtpAuthUri } from "../utils/totp";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { User } from "../models/User";
import { asObjectId, hashPassword } from "../utils/auth";

export const mfaRouter = Router();

// All MFA routes require authentication
mfaRouter.use(requireAuth);

function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

/** GET /api/v1/mfa/status */
mfaRouter.get("/status", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const user = await User.findById(asObjectId(auth.sub)).select("mfa.enabled").lean();
  if (!user) return res.status(404).json({ error: "user_not_found" });
  return res.json({ mfaEnabled: !!user.mfa?.enabled });
});

/** POST /api/v1/mfa/setup — generate secret + QR code (does NOT enable MFA yet) */
mfaRouter.post("/setup", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const user = await User.findById(asObjectId(auth.sub));
  if (!user) return res.status(404).json({ error: "user_not_found" });
  if (user.mfa?.enabled) return res.status(400).json({ error: "mfa_already_enabled" });

  const secret = generateSecret();
  const otpauth = buildOtpAuthUri(user.email, "TRES CRM", secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  // Store secret (not yet enabled) — user must verify before activation
  user.mfa = { secret, enabled: false, recoveryCodes: [] };
  await user.save();

  return res.json({ secret, qrCode: qrCodeDataUrl, otpauth });
});

/** POST /api/v1/mfa/verify — verify TOTP code and enable MFA, return recovery codes */
mfaRouter.post("/verify", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

  const user = await User.findById(asObjectId(auth.sub));
  if (!user) return res.status(404).json({ error: "user_not_found" });
  if (!user.mfa?.secret) return res.status(400).json({ error: "mfa_not_setup" });
  if (user.mfa.enabled) return res.status(400).json({ error: "mfa_already_enabled" });

  const valid = verifyTOTP(code, user.mfa.secret);
  if (!valid) return res.status(400).json({ error: "invalid_code" });

  const recoveryCodes = generateRecoveryCodes();
  user.mfa.enabled = true;
  user.mfa.verifiedAt = new Date();
  user.mfa.recoveryCodes = recoveryCodes.map(c => crypto.createHash("sha256").update(c).digest("hex"));
  await user.save();

  // Return plaintext recovery codes ONCE — they are hashed in DB
  return res.json({ mfaEnabled: true, recoveryCodes });
});

/** POST /api/v1/mfa/disable — disable MFA (requires current TOTP or recovery code) */
mfaRouter.post("/disable", async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const { code } = z.object({ code: z.string().min(1) }).parse(req.body);

  const user = await User.findById(asObjectId(auth.sub));
  if (!user) return res.status(404).json({ error: "user_not_found" });
  if (!user.mfa?.enabled) return res.status(400).json({ error: "mfa_not_enabled" });

  // Try TOTP first
  let valid = verifyTOTP(code, user.mfa.secret);

  // If not TOTP, try recovery code
  if (!valid) {
    const codeHash = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
    const idx = user.mfa.recoveryCodes.indexOf(codeHash);
    if (idx !== -1) {
      valid = true;
      user.mfa.recoveryCodes.splice(idx, 1); // consume recovery code
    }
  }

  if (!valid) return res.status(400).json({ error: "invalid_code" });

  user.mfa = undefined;
  await user.save();

  return res.json({ mfaEnabled: false });
});
