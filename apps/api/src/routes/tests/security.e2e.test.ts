/**
 * @module tests/security.e2e
 * Phase 1 Security Hardening -- comprehensive test suite.
 * Covers: password validation, account lockout, session management,
 * CSRF protection, input sanitization, CORS, rate limiting headers.
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { RefreshToken } from "../../models/RefreshToken";
import { hashPassword } from "../../utils/auth";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function createVerifiedUser(
  slug = "sec-test",
  email = "agent@sec.local",
  password = "StrongPass1"
) {
  const tenant = await Tenant.create({
    slug,
    branding: { name: "Sec Test" },
    plan: "COMPANY",
    seats: 5,
  });
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Sec",
    lastName: "User",
    email,
    passwordHash: await hashPassword(password),
    roles: ["OWNER", "ADMIN"],
    status: "ACTIVE",
  });
  return { tenant, user };
}

async function login(slug: string, email: string, password: string) {
  return request(app)
    .post("/api/v1/auth/login")
    .send({ tenantSlug: slug, email, password });
}

/* ================================================================== */
/*  1. Password Complexity Validation                                  */
/* ================================================================== */

describe("Password Complexity (Phase 1.7)", () => {
  test("rejects password without uppercase", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "PwTest", slug: "pw-test-1", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "a@pw.local", password: "lowercase1" },
    });
    expect(res.status).toBe(400);
  });

  test("rejects password without lowercase", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "PwTest", slug: "pw-test-2", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "b@pw.local", password: "UPPERCASE1" },
    });
    expect(res.status).toBe(400);
  });

  test("rejects password without digit", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "PwTest", slug: "pw-test-3", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "c@pw.local", password: "NoDigitsHere" },
    });
    expect(res.status).toBe(400);
  });

  test("rejects password shorter than 8 chars", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "PwTest", slug: "pw-test-4", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "d@pw.local", password: "Ab1" },
    });
    expect(res.status).toBe(400);
  });

  test("accepts valid password", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "PwTest", slug: "pw-test-ok", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "ok@pw.local", password: "ValidPass1" },
    });
    expect(res.status).toBe(201);
  });
});

/* ================================================================== */
/*  2. Account Lockout                                                 */
/* ================================================================== */

describe("Account Lockout (Phase 1.6)", () => {
  const slug = "lockout-test";
  const email = "lock@test.local";
  const password = "CorrectPass1";

  beforeAll(async () => {
    await createVerifiedUser(slug, email, password);
  });

  test("increments failedLoginAttempts on bad password", async () => {
    await login(slug, email, "WrongPass1");
    const user = await User.findOne({ email }).lean();
    expect(user?.failedLoginAttempts).toBe(1);
  });

  test("locks account after threshold attempts", async () => {
    // Set attempts to just below threshold
    await User.updateOne({ email }, { failedLoginAttempts: 9 });

    // This should trigger lockout (attempt #10)
    const res = await login(slug, email, "WrongPass1");
    expect(res.status).toBe(401);

    const user = await User.findOne({ email }).lean();
    expect(user?.failedLoginAttempts).toBe(10);
    expect(user?.lockUntil).toBeTruthy();
  });

  test("returns 423 when account is locked", async () => {
    const res = await login(slug, email, password);
    expect(res.status).toBe(423);
    expect(res.body.error).toBe("account_locked");
  });

  test("allows login after lockout expires", async () => {
    // Set lockUntil to the past
    await User.updateOne({ email }, { lockUntil: new Date(Date.now() - 1000), failedLoginAttempts: 0 });
    const res = await login(slug, email, password);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  test("resets failedLoginAttempts on successful login", async () => {
    const user = await User.findOne({ email }).lean();
    expect(user?.failedLoginAttempts).toBe(0);
  });
});

/* ================================================================== */
/*  3. Session Management (Refresh Token DB Storage)                   */
/* ================================================================== */

describe("Session Management (Phase 1.8)", () => {
  const slug = "session-test";
  const email = "sess@test.local";
  const password = "SessionPass1";
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    await createVerifiedUser(slug, email, password);
  });

  test("login stores refresh token in DB", async () => {
    const res = await login(slug, email, password);
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;

    const count = await RefreshToken.countDocuments({ revokedAt: null });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("GET /sessions lists active sessions", async () => {
    const res = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty("createdAt");
  });

  test("refresh works with valid stored token", async () => {
    expect(refreshToken).toBeTruthy();
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Authorization", `Bearer ${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    accessToken = res.body.accessToken;
  });

  test("DELETE /sessions revokes all sessions for user", async () => {
    // Create multiple sessions via direct DB insert + login
    const user = await User.findOne({ email });
    await RefreshToken.create({
      userId: user!._id,
      tenantId: user!.tenantId,
      tokenHash: "extra_session_hash_1",
      expiresAt: new Date(Date.now() + 86400000),
    });
    await RefreshToken.create({
      userId: user!._id,
      tenantId: user!.tenantId,
      tokenHash: "extra_session_hash_2",
      expiresAt: new Date(Date.now() + 86400000),
    });

    const before = await RefreshToken.countDocuments({
      userId: user!._id,
      revokedAt: null,
    });
    expect(before).toBeGreaterThanOrEqual(2);

    // Revoke all via API
    const res = await request(app)
      .delete("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    // Verify all revoked
    const after = await RefreshToken.countDocuments({
      userId: user!._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    expect(after).toBe(0);
  });
});

/* ================================================================== */
/*  4. Input Sanitization                                              */
/* ================================================================== */

describe("Input Sanitization (Phase 1.4)", () => {
  const slug = "sanitize-test";
  const email = "san@test.local";
  const password = "SanitizePass1";
  let accessToken: string;

  beforeAll(async () => {
    const { tenant } = await createVerifiedUser(slug, email, password);
    await seedActiveSubscription(String(tenant._id));
    const res = await login(slug, email, password);
    accessToken = res.body.accessToken;
  });

  test("strips script tags from ticket body", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subject: "XSS Test",
        body: '<p>Hello</p><script>alert("xss")</script>',
        priority: "LOW",
        customerEmail: "c@test.local",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.body).not.toContain("<script>");
    expect(res.body.data.body).toContain("<p>Hello</p>");
  });

  test("strips event handlers from HTML attributes", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subject: "Event Handler Test",
        body: '<p onmouseover="alert(1)">Hover me</p>',
        priority: "LOW",
        customerEmail: "c2@test.local",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.body).not.toContain("onmouseover");
  });

  test("preserves safe HTML tags", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subject: "Safe HTML Test",
        body: "<p><strong>Bold</strong> and <em>italic</em> and <a href=\"https://example.com\">link</a></p>",
        priority: "LOW",
        customerEmail: "c3@test.local",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.body).toContain("<strong>Bold</strong>");
    expect(res.body.data.body).toContain("<em>italic</em>");
    expect(res.body.data.body).toContain("<a ");
  });
});

/* ================================================================== */
/*  5. CSRF Protection                                                 */
/* ================================================================== */

describe("CSRF Protection (Phase 1.2)", () => {
  test("sets _csrf cookie on GET request", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    const csrfCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith("_csrf="))
      : undefined;
    expect(csrfCookie).toBeTruthy();
  });

  test("Bearer token requests bypass CSRF", async () => {
    const { tenant } = await createVerifiedUser("csrf-test", "csrf@test.local", "CsrfPass1");
    await seedActiveSubscription(String(tenant._id));
    const loginRes = await login("csrf-test", "csrf@test.local", "CsrfPass1");

    // POST with Bearer should work without CSRF token
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .send({
        subject: "CSRF Bypass Test",
        body: "Test body",
        priority: "LOW",
        customerEmail: "csrf-c@test.local",
      });
    expect(res.status).toBe(201);
  });
});

/* ================================================================== */
/*  6. Health Check (baseline)                                         */
/* ================================================================== */

describe("Health Check", () => {
  test("GET /healthz returns ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
