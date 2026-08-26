/**
 * @module tests/hardening.mfa
 * Regression tests for HARDENINGS.md section 1 — MFA enforcement and the
 * login-to-verify handoff.
 */
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { testSetup, testTeardown } from "../../tests/helpers";
import crypto from "crypto";
import { User } from "../../models/User";
import { MfaChallenge } from "../../models/MfaChallenge";
import { Tenant } from "../../models/Tenant";
import { requireMfaForPrivileged } from "../../middlewares/auth";
import { hashPassword, signAccessToken } from "../../utils/auth";
import { generateSecret, generateTOTP } from "../../utils/totp";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let slugCounter = 0;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const PASSWORD = "TestPass1!";

async function makeUser(opts: { mfa?: { secret: string; enabled: boolean }; roles?: Role[] } = {}) {
  const slug = `mfa-${slugCounter++}`;
  const tenant = await Tenant.create({
    slug,
    branding: { name: slug },
    plan: "COMPANY",
    seats: 5,
  });
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Mfa",
    lastName: "User",
    email: `${slug}@test.local`,
    passwordHash: await hashPassword(PASSWORD),
    roles: opts.roles ?? ["OWNER"],
    status: "ACTIVE",
    mfa: opts.mfa
      ? { secret: opts.mfa.secret, enabled: opts.mfa.enabled, recoveryCodes: [] }
      : undefined,
  });
  return { tenant, user, slug };
}

/* ------------------------------------------------------------------ */
/*  requireMfaForPrivileged must fail closed                           */
/* ------------------------------------------------------------------ */

describe("requireMfaForPrivileged — database failure", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  function setNodeEnv(value: string | undefined) {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = value;
  }

  afterEach(() => {
    setNodeEnv(savedNodeEnv);
    jest.restoreAllMocks();
  });

  /** Drive the middleware directly; it reads the token itself. */
  function run(token: string) {
    const result = { status: 0, body: undefined as any, nextCalled: false };
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(payload: any) {
        result.body = payload;
        return this;
      },
    } as unknown as Response;
    const req = {
      header: (name: string) =>
        name === "Authorization" ? `Bearer ${token}` : undefined,
      cookies: {},
    } as unknown as Request;

    requireMfaForPrivileged(req, res, (() => {
      result.nextCalled = true;
    }) as NextFunction);

    return result;
  }

  /**
   * The middleware resolves through a real database round-trip, so wait for it
   * to reach a decision rather than assuming it lands within a fixed tick.
   */
  async function settle(result: { status: number; nextCalled: boolean }) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (result.status !== 0 || result.nextCalled) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("middleware never reached a decision");
  }

  test("denies a privileged user when the MFA lookup fails", async () => {
    const { user, tenant } = await makeUser({ roles: ["OWNER"] });
    const token = signAccessToken({
      sub: String(user._id),
      tid: String(tenant._id),
      roles: ["OWNER"],
    });

    // The middleware short-circuits under NODE_ENV=test, so leave test mode.
    setNodeEnv("production");
    jest.spyOn(User, "findById").mockReturnValue({
      select: () => ({ lean: () => Promise.reject(new Error("mongo is down")) }),
    } as any);

    const result = run(token);
    await settle(result);

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(403);
    expect(result.body.error).toBe("mfa_required");
  });

  test("denies a privileged user who has not enabled MFA", async () => {
    const { user, tenant } = await makeUser({ roles: ["OWNER"] });
    const token = signAccessToken({
      sub: String(user._id),
      tid: String(tenant._id),
      roles: ["OWNER"],
    });

    setNodeEnv("production");

    const result = run(token);
    await settle(result);

    expect(result.status).toBe(403);
  });

  test("admits a privileged user with MFA enabled", async () => {
    const secret = generateSecret();
    const { user, tenant } = await makeUser({
      roles: ["OWNER"],
      mfa: { secret, enabled: true },
    });
    const token = signAccessToken({
      sub: String(user._id),
      tid: String(tenant._id),
      roles: ["OWNER"],
    });

    setNodeEnv("production");

    const result = run(token);
    await settle(result);

    expect(result.nextCalled).toBe(true);
  });

  test("lets a non-privileged user through without a lookup", async () => {
    const { user, tenant } = await makeUser({ roles: ["AGENT"] });
    const token = signAccessToken({
      sub: String(user._id),
      tid: String(tenant._id),
      roles: ["AGENT"],
    });

    setNodeEnv("production");
    const spy = jest.spyOn(User, "findById");

    const result = run(token);

    expect(result.nextCalled).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  MFA ticket is bound to the client that requested it                */
/* ------------------------------------------------------------------ */

describe("MFA ticket binding", () => {
  const UA = "Mozilla/5.0 (LegitimateBrowser)";

  async function loginForTicket(userAgent = UA) {
    const secret = generateSecret();
    const { user, slug } = await makeUser({ mfa: { secret, enabled: true } });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("User-Agent", userAgent)
      .send({ email: user.email, password: PASSWORD, tenantSlug: slug });

    return { res, secret, user, slug };
  }

  test("login with MFA enabled returns a challenge rather than tokens", async () => {
    const { res } = await loginForTicket();

    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.mfaTicket).toBeTruthy();
  });

  test("the ticket completes MFA from the same client", async () => {
    const { res, secret } = await loginForTicket();

    const verify = await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", UA)
      .send({ mfaTicket: res.body.mfaTicket, code: generateTOTP(secret) });

    expect(verify.status).toBe(200);
  });

  test("the ticket is rejected from a different user agent", async () => {
    const { res, secret } = await loginForTicket();

    const verify = await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", "curl/8.0 (attacker)")
      .send({ mfaTicket: res.body.mfaTicket, code: generateTOTP(secret) });

    expect(verify.status).toBe(401);
    expect(verify.body.error).toBe("mfa_invalid");
  });

  test("a rejected ticket is burned and cannot be retried correctly", async () => {
    const { res, secret } = await loginForTicket();

    await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", "curl/8.0 (attacker)")
      .send({ mfaTicket: res.body.mfaTicket, code: generateTOTP(secret) });

    // Even the original client cannot reuse it now.
    const retry = await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", UA)
      .send({ mfaTicket: res.body.mfaTicket, code: generateTOTP(secret) });

    expect(retry.status).toBe(401);
    expect(retry.body.error).toBe("mfa_expired");
  });

  test("an unknown ticket is rejected", async () => {
    const verify = await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", UA)
      .send({ mfaTicket: "not-a-real-ticket", code: "000000" });

    expect(verify.status).toBe(401);
  });

  test("a valid ticket with a wrong code is still rejected", async () => {
    const { res } = await loginForTicket();

    const verify = await request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", UA)
      .send({ mfaTicket: res.body.mfaTicket, code: "000000" });

    expect(verify.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Challenges live in a TTL collection, not process memory            */
/* ------------------------------------------------------------------ */

describe("MFA challenge persistence", () => {
  const UA = "Mozilla/5.0 (LegitimateBrowser)";

  // Earlier blocks leave unconsumed challenges behind; start from a clean
  // collection so the counts below mean what they say.
  beforeEach(async () => {
    await MfaChallenge.deleteMany({});
  });

  async function loginForTicket() {
    const secret = generateSecret();
    const { user, slug } = await makeUser({ mfa: { secret, enabled: true } });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("User-Agent", UA)
      .send({ email: user.email, password: PASSWORD, tenantSlug: slug });
    return { res, secret, user, slug };
  }

  function verify(ticket: string, code: string, ua = UA) {
    return request(app)
      .post("/api/v1/auth/mfa-verify")
      .set("User-Agent", ua)
      .send({ mfaTicket: ticket, code });
  }

  test("the challenge is written to the collection, not held in memory", async () => {
    const { res } = await loginForTicket();

    const stored = await MfaChallenge.findOne({
      ticketHash: crypto.createHash("sha256").update(res.body.mfaTicket).digest("hex"),
    }).lean();

    expect(stored).toBeTruthy();
    expect(stored!.attempts).toBe(0);
  });

  test("the raw ticket is never stored", async () => {
    const { res } = await loginForTicket();
    const ticket = res.body.mfaTicket;

    const all = await MfaChallenge.find({}).lean();
    expect(JSON.stringify(all)).not.toContain(ticket);
  });

  test("the challenge carries an expiry for the TTL sweeper", async () => {
    const { res } = await loginForTicket();

    const stored = await MfaChallenge.findOne({
      ticketHash: crypto.createHash("sha256").update(res.body.mfaTicket).digest("hex"),
    }).lean();

    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  test("the TTL index exists so challenges cannot accumulate", async () => {
    await loginForTicket();

    const indexes = await MfaChallenge.collection.indexes();
    const ttl = indexes.find((i: any) => i.key?.expiresAt === 1);
    expect(ttl).toBeTruthy();
    expect(ttl!.expireAfterSeconds).toBe(0);
  });

  test("a challenge past its expiry is refused even before the sweeper runs", async () => {
    // Mongo removes expired documents on a roughly one-minute cycle, so the
    // handler must judge by the timestamp rather than by the row existing.
    const { res, secret } = await loginForTicket();
    const ticketHash = crypto.createHash("sha256").update(res.body.mfaTicket).digest("hex");
    await MfaChallenge.updateOne(
      { ticketHash },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const verified = await verify(res.body.mfaTicket, generateTOTP(secret));

    expect(verified.status).toBe(401);
    expect(verified.body.error).toBe("mfa_expired");
  });

  test("a successful verification consumes the challenge", async () => {
    const { res, secret } = await loginForTicket();

    await verify(res.body.mfaTicket, generateTOTP(secret));

    expect(await MfaChallenge.countDocuments({})).toBe(0);
  });

  test("a consumed challenge cannot be replayed", async () => {
    const { res, secret } = await loginForTicket();

    await verify(res.body.mfaTicket, generateTOTP(secret));
    const replay = await verify(res.body.mfaTicket, generateTOTP(secret));

    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe("mfa_expired");
  });

  test("a wrong code leaves the challenge usable and counts the attempt", async () => {
    const { res, secret } = await loginForTicket();
    const ticketHash = crypto.createHash("sha256").update(res.body.mfaTicket).digest("hex");

    const bad = await verify(res.body.mfaTicket, "000000");
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe("invalid_mfa_code");
    expect((await MfaChallenge.findOne({ ticketHash }).lean())!.attempts).toBe(1);

    // A typo must not force a new login.
    const good = await verify(res.body.mfaTicket, generateTOTP(secret));
    expect(good.status).toBe(200);
  });

  test("the challenge is dropped after too many wrong codes", async () => {
    const { res, secret } = await loginForTicket();

    for (let i = 0; i < 4; i++) {
      expect((await verify(res.body.mfaTicket, "000000")).body.error).toBe("invalid_mfa_code");
    }
    const fifth = await verify(res.body.mfaTicket, "000000");

    expect(fifth.status).toBe(401);
    expect(fifth.body.error).toBe("mfa_expired");
    expect(await MfaChallenge.countDocuments({})).toBe(0);

    // Even the right code no longer works — the challenge is gone.
    expect((await verify(res.body.mfaTicket, generateTOTP(secret))).status).toBe(401);
  });

  test("a binding mismatch removes the challenge from the collection", async () => {
    const { res, secret } = await loginForTicket();

    await verify(res.body.mfaTicket, generateTOTP(secret), "curl/8.0 (attacker)");

    expect(await MfaChallenge.countDocuments({})).toBe(0);
  });
});
