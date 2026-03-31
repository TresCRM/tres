import { Router } from "express";
import type { AuthRequest } from "../types/auth";
import crypto, { timingSafeEqual } from "crypto";
import { verifyTOTP } from "../utils/totp";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, hashToken, verifyRefreshToken, asObjectId } from "../utils/auth";
import { SignupSchema, LoginSchema, VerifySchema } from "../services/schemas";
import { ENV } from "../config/env";
import { RefreshToken } from "../models/RefreshToken";
import { sanitizeUserHtml } from "../utils/sanitize";
import { setAuthCookies, clearAuthCookies } from '../auth/cookies';
import { sendVerificationEmail } from "../services/mailer";
import { requireAuth } from "../middlewares/auth";
import { registry } from "../docs/swagger";
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { logSecurityEvent } from "../services/securityLogger";
extendZodWithOpenApi(z);

const PASSWORD_MAX_AGE_DAYS = ENV.PASSWORD_MAX_AGE_DAYS;
// Pending MFA challenges — in-memory, short-lived (5 min TTL)
const mfaPending = new Map<string, { userId: string; tenantId: string; roles: string[]; email: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of mfaPending) { if (v.expiresAt < now) mfaPending.delete(k); }
}, 60_000);

export const authRouter = Router();
const DISABLED = ENV.EMAILS_DISABLED;

/** POST /api/v1/auth/signup */
authRouter.post("/signup", async (req, res) => {
  try {
    const { tenant, owner, branding } = SignupSchema.parse(req.body);
    const exists = await Tenant.findOne({ slug: tenant.slug });
    if (exists) return res.status(409).json({ error: "tenant_slug_taken" });

    const newTenant = await Tenant.create({
      slug: tenant.slug.toLowerCase(),
      plan: tenant.plan,
      seats: tenant.plan === "COMPANY" ? 5 : 1,
      branding: {
        name: tenant.name,
        primaryColor: branding?.primaryColor ?? "#1a73e8",
        surfaceColor: branding?.surfaceColor ?? "#f1f3f4",
        logoUrl: branding?.logoUrl,
        emailFrom: branding?.emailFrom
      }
    });

    const token = crypto.randomBytes(24).toString("hex");
    const passwordHash = await hashPassword(owner.password);

    const user = await User.create({
      tenantId: newTenant._id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email.toLowerCase(),
      passwordHash,
      roles: ["OWNER"],
      status: "PENDING",
      emailVerification: {
        token,
        expiresAt: new Date(Date.now() + 1000*60*60*24) // 24h
      }
    });

    if(!DISABLED){
      await sendVerificationEmail(owner.email, newTenant.slug, token, newTenant.branding.emailFrom);
    }
    return res.status(201).json({
      tenant: { id: newTenant._id, slug: newTenant.slug, name: newTenant.branding.name },
      owner: { id: user._id, email: user.email, status: user.status }
    });
  } catch (e:any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

/** POST /api/v1/auth/verify */
authRouter.post("/verify", async (req, res) => {
  try {
    const { email, tenantSlug, token } = VerifySchema.parse(req.body);
    const tenant = await Tenant.findOne({ slug: tenantSlug.toLowerCase() });
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const user = await User.findOne({ tenantId: tenant._id, email: email.toLowerCase() });
    if (!user || !user.emailVerification) return res.status(400).json({ error: "no_token" });
    const tokenMatch = user.emailVerification.token.length === token.length &&
      timingSafeEqual(Buffer.from(user.emailVerification.token), Buffer.from(token));
    if (!tokenMatch) return res.status(400).json({ error: "bad_token" });
    if (user.emailVerification.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "expired_token" });

    user.status = "ACTIVE";
    user.emailVerification.verifiedAt = new Date();
    await user.save();

    return res.json({ ok: true });
  } catch (e:any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

/** POST /api/v1/auth/resend */
authRouter.post("/resend", async (req, res) => {
  try {
    const body = z.object({
      tenantSlug: z.string().min(3),
      email: z.email(),
    }).parse(req.body);

    const tenant = await Tenant.findOne({ slug: body.tenantSlug.toLowerCase() });
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const user = await User.findOne({ tenantId: tenant._id, email: body.email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "user_not_found" });
    if (user.status === "ACTIVE") return res.status(400).json({ error: "already_verified" });

    const token = crypto.randomBytes(24).toString("hex");
    user.emailVerification = {
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      verifiedAt: undefined,
    };
    await user.save();

    if (!DISABLED) {
      await sendVerificationEmail(user.email, tenant.slug, token, tenant.branding?.emailFrom);
    }
    return res.status(200).json({ ok: true });
  } catch (e:any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});


/** Helper: complete login (issue tokens, set cookies) */
async function completeLogin(req: any, res: any, user: any, tenant: any) {
  const payload = { sub: String(user._id), tid: String(tenant._id), roles: user.roles };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  setAuthCookies(res, { accessToken, refreshToken, role: user.roles[0] });
  await RefreshToken.create({
    userId: user._id,
    tenantId: tenant._id,
    tokenHash: hashToken(refreshToken),
    ip: req.ip,
    deviceInfo: req.headers["user-agent"],
    expiresAt: new Date(Date.now() + ENV.REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  // Check password expiry
  const passwordExpired = PASSWORD_MAX_AGE_DAYS > 0 && user.passwordChangedAt
    ? (Date.now() - user.passwordChangedAt.getTime()) > PASSWORD_MAX_AGE_DAYS * 86_400_000
    : false;

  // Privileged roles must have MFA enabled
  const PRIVILEGED_ROLES = ["OWNER", "ADMIN"];
  const mfaSetupRequired = user.roles.some((r: string) => PRIVILEGED_ROLES.includes(r)) && !user.mfa?.enabled;

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, roles: user.roles },
    tenant: { id: tenant._id, slug: tenant.slug },
    passwordExpired,
    mfaSetupRequired,
  });
}

/** POST /api/v1/auth/login */
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password, tenantSlug } = LoginSchema.parse(req.body);
    const tenant = await Tenant.findOne({ slug: tenantSlug.toLowerCase(), isActive: true });
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const user = await User.findOne({ tenantId: tenant._id, email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "bad_credentials" });
    if (user.status !== "ACTIVE") return res.status(403).json({ error: "user_not_active" });

    const secCtx = { tenantId: String(tenant._id), userId: String(user._id), email: email, ip: req.ip, userAgent: req.headers["user-agent"] as string };

    // Account lockout check
    if (user.lockUntil && user.lockUntil > new Date()) {
      logSecurityEvent({ event: "auth.login.locked", ...secCtx });
      return res.status(423).json({ error: "account_locked", message: "Account temporarily locked. Try again later." });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update: any = { failedLoginAttempts: attempts };
      if (attempts >= ENV.ACCOUNT_LOCKOUT_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + ENV.ACCOUNT_LOCKOUT_MINUTES * 60_000);
      }
      await User.updateOne({ _id: user._id }, update);
      logSecurityEvent({ event: "auth.login.failed", ...secCtx, metadata: { attempts } });
      return res.status(401).json({ error: "bad_credentials" });
    }

    if (user.failedLoginAttempts > 0) {
      await User.updateOne({ _id: user._id }, { failedLoginAttempts: 0, lockUntil: null });
    }

    // If MFA is enabled, return challenge instead of tokens
    if (user.mfa?.enabled) {
      const ticket = crypto.randomBytes(32).toString("hex");
      mfaPending.set(ticket, {
        userId: String(user._id),
        tenantId: String(tenant._id),
        roles: user.roles,
        email: user.email,
        expiresAt: Date.now() + 5 * 60_000, // 5 min
      });
      logSecurityEvent({ event: "auth.mfa.challenge", ...secCtx });
      return res.json({ mfaRequired: true, mfaTicket: ticket });
    }

    logSecurityEvent({ event: "auth.login.success", ...secCtx });
    return completeLogin(req, res, user, tenant);
  } catch (e:any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

/** POST /api/v1/auth/mfa-verify — complete login with TOTP code */
authRouter.post("/mfa-verify", async (req, res) => {
  try {
    const { mfaTicket, code } = z.object({
      mfaTicket: z.string().min(1),
      code: z.string().min(1),
    }).parse(req.body);

    const pending = mfaPending.get(mfaTicket);
    if (!pending || pending.expiresAt < Date.now()) {
      mfaPending.delete(mfaTicket);
      return res.status(401).json({ error: "mfa_expired", message: "MFA session expired. Please sign in again." });
    }

    const user = await User.findById(asObjectId(pending.userId));
    if (!user || !user.mfa?.enabled) {
      mfaPending.delete(mfaTicket);
      return res.status(401).json({ error: "bad_credentials" });
    }

    // Try TOTP
    let valid = verifyTOTP(code, user.mfa.secret);

    // Try recovery code
    if (!valid) {
      const codeHash = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
      const idx = user.mfa.recoveryCodes.indexOf(codeHash);
      if (idx !== -1) {
        valid = true;
        user.mfa.recoveryCodes.splice(idx, 1);
        await user.save();
      }
    }

    if (!valid) {
      logSecurityEvent({ event: "auth.mfa.failed", userId: pending.userId, tenantId: pending.tenantId, email: pending.email, ip: req.ip, userAgent: req.headers["user-agent"] as string });
      return res.status(401).json({ error: "invalid_mfa_code" });
    }

    mfaPending.delete(mfaTicket);
    logSecurityEvent({ event: "auth.mfa.success", userId: pending.userId, tenantId: pending.tenantId, email: pending.email, ip: req.ip, userAgent: req.headers["user-agent"] as string });

    const tenant = await Tenant.findById(asObjectId(pending.tenantId));
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    return completeLogin(req, res, user, tenant);
  } catch (e: any) {
    return res.status(400).json({ error: "invalid_request", details: e.message });
  }
});

/** POST /api/v1/auth/change-password */
authRouter.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(ENV.PASSWORD_MIN_LENGTH)
        .regex(/[A-Z]/, "Must contain uppercase")
        .regex(/[a-z]/, "Must contain lowercase")
        .regex(/[0-9]/, "Must contain digit"),
    }).parse(req.body);

    const auth = (req as AuthRequest).auth;
    const user = await User.findById(asObjectId(auth.sub));
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "bad_credentials" });

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    return res.json({ ok: true });
  } catch (e: any) {
    if (e.name === "ZodError") return res.status(400).json({ error: "invalid_request", details: e.issues });
    return res.status(400).json({ error: "invalid_request" });
  }
});

/** POST /api/v1/auth/refresh — with token rotation */
authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.tc_refresh || (req.headers.authorization ?? "").replace("Bearer ", "");
  if (!token) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "invalid_refresh" });
  }
  try {
    const payload = verifyRefreshToken(token);
    const oldHash = hashToken(token);
    const stored = await RefreshToken.findOne({ tokenHash: oldHash, revokedAt: null });
    if (!stored) {
      // Stolen token reuse detection: if the token was already rotated,
      // revoke the entire family to protect the user
      const rotated = await RefreshToken.findOne({ tokenHash: oldHash });
      if (rotated?.replacedByHash) {
        logSecurityEvent({ event: "auth.token.stolen", userId: String(rotated.userId), tenantId: String(rotated.tenantId), ip: req.ip, userAgent: req.headers["user-agent"] as string });
        await RefreshToken.updateMany(
          { userId: rotated.userId, revokedAt: null },
          { revokedAt: new Date() }
        );
      }
      clearAuthCookies(res);
      return res.status(401).json({ error: "invalid_refresh" });
    }

    // Device binding: detect IP/UA drift
    const currentIp = req.ip || "";
    const currentUa = (req.headers["user-agent"] || "").slice(0, 100);
    const storedIp = stored.ip || "";
    const storedUa = (stored.deviceInfo || "").slice(0, 100);
    const ipChanged = storedIp && currentIp && storedIp !== currentIp;
    const uaChanged = storedUa && currentUa && storedUa !== currentUa;
    // If BOTH IP and UA changed simultaneously, treat as suspicious
    if (ipChanged && uaChanged) {
      logSecurityEvent({ event: "auth.token.stolen", userId: String(stored.userId), tenantId: String(stored.tenantId), ip: currentIp, userAgent: currentUa, metadata: { reason: "ip_ua_drift", oldIp: storedIp, newIp: currentIp } });
      await RefreshToken.updateMany({ userId: stored.userId, revokedAt: null }, { revokedAt: new Date() });
      clearAuthCookies(res);
      return res.status(401).json({ error: "session_invalidated", message: "Session invalidated due to suspicious activity. Please sign in again." });
    }

    // Issue new tokens (rotation)
    const accessToken = signAccessToken({ sub: payload.sub, tid: payload.tid, roles: payload.roles });
    const newRefreshToken = signRefreshToken({ sub: payload.sub, tid: payload.tid, roles: payload.roles });
    const newHash = hashToken(newRefreshToken);

    // Revoke old, link to new
    await RefreshToken.updateOne({ _id: stored._id }, { revokedAt: new Date(), replacedByHash: newHash });

    // Create new session record
    await RefreshToken.create({
      userId: stored.userId,
      tenantId: stored.tenantId,
      tokenHash: newHash,
      ip: req.ip,
      deviceInfo: req.headers["user-agent"],
      expiresAt: new Date(Date.now() + ENV.REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    setAuthCookies(res, { accessToken, refreshToken: newRefreshToken, role: payload.roles[0] as any });
    return res.json({ accessToken });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ error: "invalid_refresh" });
  }
});

/** GET /api/v1/auth/me */
authRouter.get("/me", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  let user: any = null;
  try { user = await User.findById(asObjectId(auth.sub)).select("mfa.enabled").lean(); } catch {}
  const PRIVILEGED_ROLES = ["OWNER", "ADMIN"];
  const mfaEnabled = !!user?.mfa?.enabled;
  const mfaSetupRequired = auth.roles.some((r: string) => PRIVILEGED_ROLES.includes(r)) && !mfaEnabled;
  return res.json({ ...auth, mfaEnabled, mfaSetupRequired });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    const token = req.cookies?.tc_refresh || (req.headers.authorization ?? "").replace("Bearer ", "");
    if (token) {
      await RefreshToken.updateOne({ tokenHash: hashToken(token) }, { revokedAt: new Date() });
    }
    clearAuthCookies(res);
    res.status(200).json({ ok: true });
  } catch (error: any) {
    clearAuthCookies(res);
    res.status(200).json({ ok: true });
  }
});

authRouter.get('/cookie-me', (req, res) => {
  // Access token comes via httpOnly cookie; for API-to-API you could accept Authorization header
  const role = req.cookies?.tc_role;
  const session = req.cookies?.tc_session ? true : false;
  if (!session || !role) return res.status(401).json({ error: 'Unauthenticated' });
  // In a real app, verify tc_session and pull user info here; for demo we return role only
  res.status(200).json({ ok: true, role });
});

/** GET /api/v1/auth/sessions -- list active sessions for current user */
authRouter.get("/sessions", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const sessions = await RefreshToken.find({ userId: asObjectId(auth.sub), revokedAt: null, expiresAt: { $gt: new Date() } })
    .select("deviceInfo ip createdAt expiresAt")
    .sort({ createdAt: -1 })
    .lean();
  return res.json({ data: sessions });
});

/** DELETE /api/v1/auth/sessions/:id -- revoke a specific session */
authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const result = await RefreshToken.updateOne(
    { _id: req.params.id, userId: asObjectId(auth.sub), revokedAt: null },
    { revokedAt: new Date() }
  );
  if (result.modifiedCount === 0) return res.status(404).json({ error: "session_not_found" });
  return res.json({ ok: true });
});

/** DELETE /api/v1/auth/sessions -- revoke all sessions (log out everywhere) */
authRouter.delete("/sessions", requireAuth, async (req, res) => {
  const auth = (req as AuthRequest).auth;
  await RefreshToken.updateMany({ userId: asObjectId(auth.sub), revokedAt: null }, { revokedAt: new Date() });
  clearAuthCookies(res);
  return res.json({ ok: true });
});

/* ---------- Zod response schemas (for docs) ---------- */
const SignupResp = z.object({
  tenant: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  owner: z.object({
    id: z.string(),
    email: z.email(),
    status: z.enum(["PENDING", "ACTIVE", "DISABLED"]),
  }),
});
const VerifyResp = z.object({ ok: z.boolean() });
const LoginResp = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.email(),
    roles: z.array(z.string()),
  }),
  tenant: z.object({ id: z.string(), slug: z.string() }),
});
const RefreshResp = z.object({ accessToken: z.string() });
const MeResp = z.object({
  sub: z.string(),
  tid: z.string(),
  roles: z.array(z.string()),
});

const LoutRes = z.object({
  ok: z.boolean(),
});
const CookieResp = z.object({
  ok: z.boolean(),
  role: z.string(),
});

/* ---------- OpenAPI: register paths ---------- */

// Signup (public)
registry.registerPath({
  tags: ["Auths"],
  method: "post",
  path: "/api/v1/auth/signup",
  request: {
    body: { content: { "application/json": { schema: SignupSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: SignupResp } } },
    400: { description: "Bad Request" },
    409: { description: "Conflict (tenant slug taken)" },
  },
  security: [], // public
});

// Verify (public)
registry.registerPath({
  tags: ["Auths"],
  method: "post",
  path: "/api/v1/auth/verify",
  request: {
    body: { content: { "application/json": { schema: VerifySchema } } },
  },
  responses: {
    200: { description: "Verified", content: { "application/json": { schema: VerifyResp } } },
    400: { description: "Bad Request" },
    404: { description: "Tenant not found" },
  },
  security: [], // public
});

// Login (public)
registry.registerPath({
  tags: ["Auths"],
  method: "post",
  path: "/api/v1/auth/login",
  request: {
    body: { content: { "application/json": { schema: LoginSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: LoginResp } } },
    401: { description: "Bad credentials" },
    403: { description: "User not active" },
    404: { description: "Tenant not found" },
  },
  security: [], // public
});

// Refresh (public, but requires refresh token in Authorization)
registry.registerPath({
  tags: ["Auths"],
  method: "post",
  path: "/api/v1/auth/refresh",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: RefreshResp } } },
    401: { description: "Invalid refresh token" },
  },
  security: [], // keep public; describe header in description or add explicit header param if you want
});

// Me (requires Bearer)
registry.registerPath({
  tags: ["Auths"],
  method: "get",
  path: "/api/v1/auth/me",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: MeResp } } },
    401: { description: "Unauthorized" },
  },
  // (no "security: []" here) -> uses global bearerAuth
});

// Me (requires Bearer)
registry.registerPath({
  tags: ["Auths"],
  method: "post",
  path: "/api/v1/auth/logout",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: LoutRes } } },
    500: { description: "internal_error" },
  },
  // (no "security: []" here) -> uses global bearerAuth
});

// Me (requires Bearer)
registry.registerPath({
  tags: ["Auths"],
  method: "get",
  path: "/api/v1/auth/cookie-me",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: CookieResp } } },
    401: { description: "Unauthenticated" },
  },
  // (no "security: []" here) -> uses global bearerAuth
});
