/**
 * @module routes/oauth
 * Google OAuth login — no passport.js, plain fetch + manual URL construction.
 *
 * Flow:
 *  1. GET /api/v1/oauth/google          — redirect to Google consent screen
 *  2. GET /api/v1/oauth/google/callback  — exchange code, find user, issue JWT
 *
 * Returns 503 if GOOGLE_CLIENT_ID is not configured.
 */
import { Router } from "express";
import crypto from "crypto";
import { ENV } from "../config/env";
import { User } from "../models/User";
import { Tenant } from "../models/Tenant";
import { RefreshToken } from "../models/RefreshToken";
import { signAccessToken, signRefreshToken, hashToken } from "../utils/auth";
import { setAuthCookies } from "../auth/cookies";
import { logSecurityEvent } from "../services/securityLogger";

export const oauthRouter = Router();

/* ---------- helpers ---------- */

function googleEnabled(): boolean {
  return Boolean(ENV.GOOGLE_CLIENT_ID);
}

function requireGoogleEnabled(
  _req: any,
  res: any,
  next: any
) {
  if (!googleEnabled()) {
    return res.status(503).json({ error: "google_oauth_not_configured", message: "Google OAuth is not enabled on this server." });
  }
  next();
}

function microsoftEnabled(): boolean {
  return Boolean(ENV.MICROSOFT_CLIENT_ID);
}

function requireMicrosoftEnabled(
  _req: any,
  res: any,
  next: any
) {
  if (!microsoftEnabled()) {
    return res.status(503).json({ error: "microsoft_oauth_not_configured", message: "Microsoft OAuth is not enabled on this server." });
  }
  next();
}

/* ---------- In-memory CSRF state store (short-lived, 10 min) ---------- */
const pendingStates = new Map<string, { createdAt: number }>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of pendingStates) {
    if (v.createdAt < cutoff) pendingStates.delete(k);
  }
}, 60_000);

/* ---------- GET /google — redirect to consent screen ---------- */
oauthRouter.get("/google", requireGoogleEnabled, (_req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: ENV.GOOGLE_CLIENT_ID,
    redirect_uri: ENV.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/* ---------- GET /google/callback — exchange code, login ---------- */
oauthRouter.get("/google/callback", requireGoogleEnabled, async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;
  const frontendOrigin = ENV.FRONTEND_ORIGIN;

  // OAuth error from Google (user denied, etc.)
  if (oauthError) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_denied`);
  }

  // Validate state to prevent CSRF
  if (!state || !pendingStates.has(state)) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_invalid_state`);
  }
  pendingStates.delete(state);

  if (!code) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_no_code`);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.GOOGLE_CLIENT_ID,
        client_secret: ENV.GOOGLE_CLIENT_SECRET,
        redirect_uri: ENV.GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[oauth] Google token exchange failed:", tokenRes.status, await tokenRes.text());
      return res.redirect(`${frontendOrigin}/signin?error=oauth_token_failed`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; id_token?: string };

    // 2. Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error("[oauth] Google userinfo failed:", userInfoRes.status);
      return res.redirect(`${frontendOrigin}/signin?error=oauth_userinfo_failed`);
    }

    const googleUser = (await userInfoRes.json()) as {
      id: string;
      email: string;
      verified_email: boolean;
      name: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };

    if (!googleUser.email) {
      return res.redirect(`${frontendOrigin}/signin?error=oauth_no_email`);
    }

    // 3. Find user by email across all tenants (take first active match)
    const user = await User.findOne({
      email: googleUser.email.toLowerCase(),
      status: "ACTIVE",
    });

    if (!user) {
      // User not found — they need to sign up first
      return res.redirect(
        `${frontendOrigin}/signin?error=oauth_no_account&email=${encodeURIComponent(googleUser.email)}`
      );
    }

    // 4. Find the tenant
    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant || !tenant.isActive) {
      return res.redirect(`${frontendOrigin}/signin?error=oauth_tenant_inactive`);
    }

    // 5. Issue JWT tokens and set cookies (same as completeLogin in auth.ts)
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

    logSecurityEvent({
      event: "auth.oauth.google.success",
      tenantId: String(tenant._id),
      userId: String(user._id),
      email: googleUser.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] as string,
    });

    // Check if MFA setup is required for privileged roles
    const PRIVILEGED_ROLES = ["OWNER", "ADMIN"];
    const mfaSetupRequired = user.roles.some((r: string) => PRIVILEGED_ROLES.includes(r)) && !user.mfa?.enabled;

    // Redirect to frontend — it will pick up cookies and route appropriately
    if (mfaSetupRequired) {
      return res.redirect(`${frontendOrigin}/settings/security?setup=required`);
    }

    return res.redirect(`${frontendOrigin}/dashboard`);
  } catch (err: any) {
    console.error("[oauth] Google callback error:", err);
    return res.redirect(`${frontendOrigin}/signin?error=oauth_server_error`);
  }
});

/* ================================================================
 *  Microsoft OAuth — identical CSRF pattern, Microsoft Graph API
 * ================================================================ */

/* ---------- GET /microsoft/start — redirect to Microsoft consent screen ---------- */
oauthRouter.get("/microsoft/start", requireMicrosoftEnabled, (_req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: ENV.MICROSOFT_CLIENT_ID,
    redirect_uri: ENV.MICROSOFT_CALLBACK_URL,
    response_type: "code",
    scope: "openid profile email",
    response_mode: "query",
    prompt: "select_account",
    state,
  });

  return res.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  );
});

/* ---------- GET /microsoft/callback — exchange code, login ---------- */
oauthRouter.get("/microsoft/callback", requireMicrosoftEnabled, async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;
  const frontendOrigin = ENV.FRONTEND_ORIGIN;

  // OAuth error from Microsoft (user denied, etc.)
  if (oauthError) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_denied`);
  }

  // Validate state to prevent CSRF
  if (!state || !pendingStates.has(state)) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_invalid_state`);
  }
  pendingStates.delete(state);

  if (!code) {
    return res.redirect(`${frontendOrigin}/signin?error=oauth_no_code`);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.MICROSOFT_CLIENT_ID,
          client_secret: ENV.MICROSOFT_CLIENT_SECRET,
          redirect_uri: ENV.MICROSOFT_CALLBACK_URL,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenRes.ok) {
      console.error("[oauth] Microsoft token exchange failed:", tokenRes.status, await tokenRes.text());
      return res.redirect(`${frontendOrigin}/signin?error=oauth_token_failed`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; id_token?: string };

    // 2. Get user info from Microsoft Graph
    const userInfoRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error("[oauth] Microsoft Graph /me failed:", userInfoRes.status);
      return res.redirect(`${frontendOrigin}/signin?error=oauth_userinfo_failed`);
    }

    const msUser = (await userInfoRes.json()) as {
      id: string;
      displayName: string;
      mail?: string;
      userPrincipalName: string;
    };

    const email = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
    if (!email) {
      return res.redirect(`${frontendOrigin}/signin?error=oauth_no_email`);
    }

    // 3. Find user by email across all tenants (take first active match)
    const user = await User.findOne({
      email,
      status: "ACTIVE",
    });

    if (!user) {
      // User not found — they need to sign up first
      return res.redirect(
        `${frontendOrigin}/signin?error=oauth_no_account&email=${encodeURIComponent(email)}`
      );
    }

    // 4. Find the tenant
    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant || !tenant.isActive) {
      return res.redirect(`${frontendOrigin}/signin?error=oauth_tenant_inactive`);
    }

    // 5. Issue JWT tokens and set cookies (same as completeLogin in auth.ts)
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

    logSecurityEvent({
      event: "auth.oauth.microsoft.success",
      tenantId: String(tenant._id),
      userId: String(user._id),
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] as string,
    });

    // Check if MFA setup is required for privileged roles
    const PRIVILEGED_ROLES = ["OWNER", "ADMIN"];
    const mfaSetupRequired = user.roles.some((r: string) => PRIVILEGED_ROLES.includes(r)) && !user.mfa?.enabled;

    // Redirect to frontend — it will pick up cookies and route appropriately
    if (mfaSetupRequired) {
      return res.redirect(`${frontendOrigin}/settings/security?setup=required`);
    }

    return res.redirect(`${frontendOrigin}/dashboard`);
  } catch (err: any) {
    console.error("[oauth] Microsoft callback error:", err);
    return res.redirect(`${frontendOrigin}/signin?error=oauth_server_error`);
  }
});
