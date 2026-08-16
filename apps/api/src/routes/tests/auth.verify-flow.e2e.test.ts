/**
 * Email Verification — Dual Flow (code + magic link) E2E Tests
 *
 * Covers:
 *  - Signup creates both token and code
 *  - Verify with valid 6-digit code → success + ACTIVE status
 *  - Verify with valid token → success (backward compat magic link)
 *  - Neither code nor token → 400 invalid_request
 *  - Invalid code returns remainingAttempts counter
 *  - 5 failed attempts → 429 too_many_attempts with retryAfterSeconds
 *  - Subsequent attempts during lockout → 429 too_many_attempts
 *  - Resend generates fresh pair, clears attempts + lockout
 *  - Already verified user → idempotent success { alreadyVerified: true }
 *  - Expired verification → 400 expired
 *  - Wrong tenant slug → 404 tenant_not_found
 *  - Unknown email → 400 no_verification
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";

let app: any;

beforeAll(async () => {
  process.env.EMAILS_DISABLED = "1";
  app = await testSetup();
});

afterAll(async () => {
  await testTeardown();
});

/** Create a fresh unverified user via signup and return the stored verification pair. */
async function signupUser(slug: string, email = `owner@${slug}.local`) {
  await request(app).post("/api/v1/auth/signup").send({
    tenant: { name: `${slug} Co`, slug, plan: "COMPANY" },
    owner: { firstName: "Test", lastName: "User", email, password: "Password123!" },
  }).expect(201);

  const tenant = await Tenant.findOne({ slug });
  const user = await User.findOne({ tenantId: tenant!._id, email });
  return {
    tenant: tenant!,
    user: user!,
    token: user!.emailVerification!.token,
    code: user!.emailVerification!.code,
  };
}

describe("POST /auth/verify — Dual flow", () => {
  test("signup populates both token and 6-digit code", async () => {
    const { token, code } = await signupUser("dual-signup");
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(code).toMatch(/^\d{6}$/);
  });

  test("verify with valid 6-digit code activates user", async () => {
    const { tenant, user, code } = await signupUser("dual-code-ok");

    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      code,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const fresh = await User.findById(user._id);
    expect(fresh!.status).toBe("ACTIVE");
    expect(fresh!.emailVerification!.verifiedAt).toBeDefined();
    expect(fresh!.emailVerification!.attempts).toBe(0);
  });

  test("verify with valid magic-link token activates user (backward compat)", async () => {
    const { tenant, user, token } = await signupUser("dual-token-ok");

    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      token,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const fresh = await User.findById(user._id);
    expect(fresh!.status).toBe("ACTIVE");
  });

  test("verify without token or code returns 400 invalid_request", async () => {
    const { tenant, user } = await signupUser("dual-neither");
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  test("unknown tenant slug returns 404 tenant_not_found", async () => {
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: "x@x.local",
      tenantSlug: "nonexistent-slug",
      code: "123456",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("tenant_not_found");
  });

  test("unknown email returns 400 no_verification", async () => {
    const { tenant } = await signupUser("dual-unknown-email");
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: "ghost@nowhere.local",
      tenantSlug: tenant.slug,
      code: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_verification");
  });
});

describe("POST /auth/verify — Attempt tracking & lockout", () => {
  test("wrong code returns 400 with remainingAttempts counter", async () => {
    const { tenant, user } = await signupUser("attempts-one");
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      code: "000000",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_code");
    expect(res.body.remainingAttempts).toBe(4);

    const fresh = await User.findById(user._id);
    expect(fresh!.emailVerification!.attempts).toBe(1);
  });

  test("five failed attempts lock the account for 15 minutes", async () => {
    const { tenant, user } = await signupUser("attempts-lock");

    // 4 wrong attempts — should report decreasing counter
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post("/api/v1/auth/verify").send({
        email: user.email,
        tenantSlug: tenant.slug,
        code: "111111",
      });
      expect(res.status).toBe(400);
      expect(res.body.remainingAttempts).toBe(4 - i);
    }

    // 5th attempt → lockout
    const res5 = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      code: "222222",
    });
    expect(res5.status).toBe(429);
    expect(res5.body.error).toBe("too_many_attempts");
    expect(res5.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res5.body.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

    const fresh = await User.findById(user._id);
    expect(fresh!.emailVerification!.attempts).toBe(5);
    expect(fresh!.emailVerification!.lockedUntil).toBeTruthy();
    expect(fresh!.emailVerification!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  test("while locked, even a correct code returns 429 too_many_attempts", async () => {
    const { tenant, user, code } = await signupUser("attempts-locked-correct");

    // Exhaust attempts
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/auth/verify").send({
        email: user.email,
        tenantSlug: tenant.slug,
        code: "999999",
      });
    }

    // Try with the correct code — still locked
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      code,
    });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("too_many_attempts");

    // User still not activated
    const fresh = await User.findById(user._id);
    expect(fresh!.status).toBe("PENDING");
  });

  test("successful verification resets attempts counter", async () => {
    const { tenant, user, code } = await signupUser("attempts-reset-on-success");

    // 2 bad attempts
    await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code: "000001",
    });
    await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code: "000002",
    });

    // Correct code — success
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code,
    });
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh!.emailVerification!.attempts).toBe(0);
    expect(fresh!.emailVerification!.lockedUntil).toBeNull();
  });
});

describe("POST /auth/verify — Idempotency & edge cases", () => {
  test("already-verified user returns { ok: true, alreadyVerified: true }", async () => {
    const { tenant, user, code } = await signupUser("already-verified");

    // First call — succeed
    await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code,
    }).expect(200);

    // Second call — idempotent
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alreadyVerified).toBe(true);
  });

  test("expired verification returns 400 expired", async () => {
    const { tenant, user, code } = await signupUser("expired");

    // Force-expire
    await User.updateOne(
      { _id: user._id },
      { $set: { "emailVerification.expiresAt": new Date(Date.now() - 1000) } }
    );

    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("expired");
  });

  test("6-digit code fails zod validation for non-numeric", async () => {
    const { tenant, user } = await signupUser("bad-format");
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code: "abcdef",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  test("short code fails zod validation", async () => {
    const { tenant, user } = await signupUser("short-code");
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code: "12345",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });
});

describe("POST /auth/resend — Fresh pair generation", () => {
  test("resend generates new token + code pair", async () => {
    const { tenant, user, token: oldToken, code: oldCode } = await signupUser("resend-fresh");

    const res = await request(app).post("/api/v1/auth/resend").send({
      email: user.email,
      tenantSlug: tenant.slug,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const fresh = await User.findById(user._id);
    expect(fresh!.emailVerification!.token).not.toBe(oldToken);
    expect(fresh!.emailVerification!.code).not.toBe(oldCode);
    expect(fresh!.emailVerification!.code).toMatch(/^\d{6}$/);
  });

  test("resend clears attempts and lockout", async () => {
    const { tenant, user } = await signupUser("resend-clears");

    // Lock out the user first
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/auth/verify").send({
        email: user.email, tenantSlug: tenant.slug, code: "999999",
      });
    }

    // Resend
    await request(app).post("/api/v1/auth/resend").send({
      email: user.email,
      tenantSlug: tenant.slug,
    }).expect(200);

    const fresh = await User.findById(user._id);
    expect(fresh!.emailVerification!.attempts).toBe(0);
    expect(fresh!.emailVerification!.lockedUntil).toBeNull();

    // New code should work
    const res = await request(app).post("/api/v1/auth/verify").send({
      email: user.email,
      tenantSlug: tenant.slug,
      code: fresh!.emailVerification!.code,
    });
    expect(res.status).toBe(200);
  });

  test("resend for already-verified user returns 400 already_verified", async () => {
    const { tenant, user, code } = await signupUser("resend-verified");

    // Verify first
    await request(app).post("/api/v1/auth/verify").send({
      email: user.email, tenantSlug: tenant.slug, code,
    }).expect(200);

    // Try to resend
    const res = await request(app).post("/api/v1/auth/resend").send({
      email: user.email, tenantSlug: tenant.slug,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("already_verified");
  });
});
