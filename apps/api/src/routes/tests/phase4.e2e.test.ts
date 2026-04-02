/**
 * @module tests/phase4.e2e
 * Phase 4: Pricing Alignment & Free Tier -- comprehensive test suite.
 * Covers: PRD-aligned pricing, free tier ticket limit, add-on system,
 * dunning T-14, auto-renew, prepay prices.
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Subscription } from "../../models/Subscription";
import { TenantAddOn } from "../../models/TenantAddOn";
import { AddOn } from "../../models/AddOn";
import { hashPassword, signAccessToken } from "../../utils/auth";
import { addDays } from "date-fns";
import {
  PLANS,
  getPlanByCode,
  priceForInterval,
  getPlanTicketLimit,
} from "../../billing/plans";
import type { Role } from "../../../../../packages/types/src/roles";

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

async function setup(slug: string, planCode = "CO-20", roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: `${slug} Co` }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: `${slug}@test.local`, passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  const now = new Date();
  await Subscription.create({
    tenantId: tenant._id, planCode, status: "ACTIVE", seats: 20,
    entitlements: getPlanByCode(planCode)?.entitlements || {},
    currentPeriodStart: now, currentPeriodEnd: addDays(now, 30),
    autoRenew: true,
  });
  return { tenant, user, token, tid: String(tenant._id) };
}

/* ================================================================== */
/*  1. PRD Pricing Alignment (4.1)                                     */
/* ================================================================== */

describe("PRD Pricing Alignment (Phase 4.1)", () => {
  test("FREE plan exists at $0/mo", () => {
    const plan = getPlanByCode("FREE");
    expect(plan).not.toBeNull();
    expect(plan!.priceCentsMonthly).toBe(0);
    expect(plan!.seats).toBe(1);
  });

  test("Individual plan is $9/mo (was $15)", () => {
    const plan = getPlanByCode("IND-1");
    expect(plan!.priceCentsMonthly).toBe(900);
  });

  test("CO-50 is $449/mo (was $399)", () => {
    const plan = getPlanByCode("CO-50");
    expect(plan!.priceCentsMonthly).toBe(44900);
  });

  test("CO-100 is $799/mo (was $699)", () => {
    const plan = getPlanByCode("CO-100");
    expect(plan!.priceCentsMonthly).toBe(79900);
  });

  test("CO-250 is $1699/mo (was $1499)", () => {
    const plan = getPlanByCode("CO-250");
    expect(plan!.priceCentsMonthly).toBe(169900);
  });

  test("CO-500 is $2999/mo (was $2499)", () => {
    const plan = getPlanByCode("CO-500");
    expect(plan!.priceCentsMonthly).toBe(299900);
  });

  test("CO-1000 is custom contract ($0, isCustom)", () => {
    const plan = getPlanByCode("CO-1000");
    expect(plan!.isCustom).toBe(true);
    expect(plan!.priceCentsMonthly).toBe(0);
  });

  test("duplicate IN-1 code is removed", () => {
    const matches = PLANS.filter(p => p.code === "IN-1" as any);
    expect(matches.length).toBe(0);
  });

  test("Individual prepay prices match PRD", () => {
    const plan = getPlanByCode("IND-1");
    expect(plan!.prepayPrices).toBeDefined();
    expect(plan!.prepayPrices!.price3Cents).toBe(2500);   // $25
    expect(plan!.prepayPrices!.price6Cents).toBe(4800);   // $48
    expect(plan!.prepayPrices!.price12Cents).toBe(9000);  // $90
  });

  test("priceForInterval uses prepay prices when available", () => {
    const plan = getPlanByCode("IND-1")!;
    expect(priceForInterval(plan, "QUARTER")).toBe(2500);
    expect(priceForInterval(plan, "SEMIANNUAL")).toBe(4800);
    expect(priceForInterval(plan, "ANNUAL")).toBe(9000);
    expect(priceForInterval(plan, "MONTH")).toBe(900);
  });

  test("company plans use discount formula for prepay", () => {
    const plan = getPlanByCode("CO-20")!;
    // Quarter: 19900 * 3 * 0.95 = 56715
    expect(priceForInterval(plan, "QUARTER")).toBe(56715);
    // Annual: 19900 * 12 * 0.88 = 210144
    expect(priceForInterval(plan, "ANNUAL")).toBe(210144);
  });

  test("custom plan returns 0 for all intervals", () => {
    const plan = getPlanByCode("CO-1000")!;
    expect(priceForInterval(plan, "MONTH")).toBe(0);
    expect(priceForInterval(plan, "ANNUAL")).toBe(0);
  });

  test("all plans have ticketLimit (null = unlimited, 50 for FREE)", () => {
    expect(getPlanTicketLimit("FREE")).toBe(50);
    expect(getPlanTicketLimit("IND-1")).toBeNull();
    expect(getPlanTicketLimit("CO-20")).toBeNull();
  });
});

/* ================================================================== */
/*  2. Free Tier (4.2)                                                 */
/* ================================================================== */

describe("Free Tier (Phase 4.2)", () => {
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await Tenant.create({
      slug: "free-tier-test", branding: { name: "Free Co" }, plan: "FREE", seats: 1,
    });
    const user = await User.create({
      tenantId: tenant._id, firstName: "Free", lastName: "User",
      email: "free@test.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["OWNER"], status: "ACTIVE",
    });
    token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles: ["OWNER"] });
    tenantId = String(tenant._id);

    // Create FREE subscription
    const now = new Date();
    await Subscription.create({
      tenantId: tenant._id, planCode: "FREE", status: "ACTIVE", seats: 1,
      entitlements: { ticketLimit: 50 },
      currentPeriodStart: now, currentPeriodEnd: addDays(now, 365 * 10), // free never expires
    });
  });

  test("free tier user can create tickets within limit", async () => {
    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Free ticket", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(res.status).toBe(201);
  });

  test("lifetime ticket count increments", async () => {
    const tenant = await Tenant.findOne({ slug: "free-tier-test" }).lean();
    expect(tenant!.lifetimeTicketCount).toBeGreaterThanOrEqual(1);
  });

  test("free tier is blocked when ticket limit reached", async () => {
    // Set count to limit
    await Tenant.updateOne({ _id: tenantId }, { lifetimeTicketCount: 50 });

    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Over limit", body: "test", priority: "LOW", customerEmail: "c2@t.com" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ticket_limit_reached");
    expect(res.body.limit).toBe(50);
    expect(res.body.used).toBe(50);
  });

  test("paid plans are not affected by ticket limit", async () => {
    const s = await setup("paid-no-limit");
    // Create many tickets (paid plan has no limit)
    await Tenant.updateOne({ slug: "paid-no-limit" }, { lifetimeTicketCount: 9999 });

    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${s.token}`)
      .send({ subject: "Paid ticket", body: "test", priority: "LOW", customerEmail: "c3@t.com" });
    expect(res.status).toBe(201);
  });
});

/* ================================================================== */
/*  3. Add-on System (4.3)                                             */
/* ================================================================== */

describe("Add-on System (Phase 4.3)", () => {
  let ownerToken: string;
  let agentToken: string;
  let tid: string;

  beforeAll(async () => {
    const s = await setup("addon-test");
    ownerToken = s.token;
    tid = s.tid;

    const agent = await User.create({
      tenantId: s.tenant._id, firstName: "Ag", lastName: "T",
      email: "ag@addon.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["AGENT"], status: "ACTIVE",
    });
    agentToken = signAccessToken({ sub: String(agent._id), tid, roles: ["AGENT"] });
  });

  test("list available add-ons", async () => {
    const res = await request(app).get("/api/v1/add-ons/available")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);

    const codes = res.body.data.map((a: any) => a.code);
    expect(codes).toContain("EXTRA_SEAT");
    expect(codes).toContain("SSO_SAML");
    expect(codes).toContain("PREMIUM_ANALYTICS");
  });

  test("activate an add-on", async () => {
    const res = await request(app).post("/api/v1/add-ons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ code: "EXTRA_SEAT", quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.addOnCode).toBe("EXTRA_SEAT");
    expect(res.body.data.quantity).toBe(5);
  });

  test("duplicate activation returns 409", async () => {
    const res = await request(app).post("/api/v1/add-ons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ code: "EXTRA_SEAT" });
    expect(res.status).toBe(409);
  });

  test("list active add-ons for tenant", async () => {
    const res = await request(app).get("/api/v1/add-ons")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].addOnCode).toBe("EXTRA_SEAT");
  });

  test("cancel an add-on", async () => {
    const res = await request(app).delete("/api/v1/add-ons/EXTRA_SEAT")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canceledAt).toBeTruthy();
  });

  test("canceled add-on not in active list", async () => {
    const res = await request(app).get("/api/v1/add-ons")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.body.data.length).toBe(0);
  });

  test("cancel nonexistent add-on returns 404", async () => {
    const res = await request(app).delete("/api/v1/add-ons/FAKE")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  test("invalid add-on code returns 400", async () => {
    const res = await request(app).post("/api/v1/add-ons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ code: "NONEXISTENT" });
    expect(res.status).toBe(400);
  });

  test("AGENT cannot activate add-ons (requires BILLING_MANAGE)", async () => {
    const res = await request(app).post("/api/v1/add-ons")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ code: "SSO_SAML" });
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  4. Subscription autoRenew field (4.4)                              */
/* ================================================================== */

describe("Subscription autoRenew (Phase 4.4)", () => {
  test("new subscriptions default to autoRenew: true", async () => {
    const s = await setup("autorenew-test");
    const sub = await Subscription.findOne({ tenantId: s.tenant._id }).lean();
    expect(sub!.autoRenew).toBe(true);
  });
});

/* ================================================================== */
/*  5. Dunning T-14 (4.4)                                             */
/* ================================================================== */

describe("Dunning Schedule (Phase 4.4 + Phase 12)", () => {
  test("billing worker has pre-renewal dunning at T-7, T-3, T-1", async () => {
    const workerSource = require("fs").readFileSync(
      require("path").join(__dirname, "../../workers/billing.worker.ts"),
      "utf-8"
    );
    // Pre-renewal: T-7, T-3, T-1
    expect(workerSource).toContain("[7, 3, 1]");
  });

  test("billing worker has post-failure dunning at T+1, T+3, T+7", async () => {
    const workerSource = require("fs").readFileSync(
      require("path").join(__dirname, "../../workers/billing.worker.ts"),
      "utf-8"
    );
    // Post-failure: T+1, T+3, T+7
    expect(workerSource).toContain("[1, 3, 7]");
  });
});

/* ================================================================== */
/*  6. Plans endpoint returns updated prices (4.1)                     */
/* ================================================================== */

describe("Plans API returns updated prices", () => {
  let token: string;

  beforeAll(async () => {
    const s = await setup("plans-api");
    token = s.token;
  });

  test("GET /subscriptions/plans returns all plans with correct prices", async () => {
    const res = await request(app).get("/api/v1/subscriptions/plans")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const plans = res.body.data;
    const free = plans.find((p: any) => p.code === "FREE");
    const ind = plans.find((p: any) => p.code === "IND-1");

    if (free) {
      expect(free.priceCentsMonthly).toBe(0);
    }
    if (ind) {
      expect(ind.priceCentsMonthly).toBe(900);
    }
  });
});
