/**
 * Subscription Plans Realignment -- E2E Tests
 * Covers: new 6-plan catalog, per-seat pricing, admin plan overrides,
 * billing intervals, add-ons
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Plan as PlanOverride } from "../../models/Plan";
import { PLANS, ADD_ONS, priceForInterval, getPlanByCode, getActivePlans } from "../../billing/plans";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: slug + " Co" }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: slug + "@test.local", passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  await seedActiveSubscription(String(tenant._id));
  return { tenant, user, token, tid: String(tenant._id), uid: String(user._id) };
}

/* ================================================================== */
/*  1. New 6-plan catalog                                              */
/* ================================================================== */
describe("New Plan Catalog (Business Plan alignment)", () => {
  test("PLANS contains all 6 canonical plans", () => {
    const codes = PLANS.filter(p => !p.isLegacy).map(p => p.code);
    expect(codes).toContain("FREE");
    expect(codes).toContain("STARTER");
    expect(codes).toContain("TEAM");
    expect(codes).toContain("BUSINESS");
    expect(codes).toContain("ADVANCED");
    expect(codes).toContain("ENTERPRISE");
  });

  test("FREE plan is $0 with 50 ticket limit", () => {
    const free = getPlanByCode("FREE")!;
    expect(free.priceCentsPerSeat).toBe(0);
    expect(free.seats).toBe(1);
    expect(free.entitlements.ticketLimit).toBe(50);
  });

  test("STARTER plan is $5/seat/mo with 5 seats", () => {
    const starter = getPlanByCode("STARTER")!;
    expect(starter.priceCentsPerSeat).toBe(500);
    expect(starter.seats).toBe(5);
    expect(starter.entitlements.ticketLimit).toBe(null);
  });

  test("TEAM plan is $9/seat/mo with 20 seats and live chat", () => {
    const team = getPlanByCode("TEAM")!;
    expect(team.priceCentsPerSeat).toBe(900);
    expect(team.seats).toBe(20);
    expect(team.entitlements.liveChat).toBe(true);
    expect(team.entitlements.slaPolicies).toBe(true);
    expect(team.entitlements.customFields).toBe(true);
  });

  test("BUSINESS plan is $15/seat/mo with video calls and custom subdomain", () => {
    const business = getPlanByCode("BUSINESS")!;
    expect(business.priceCentsPerSeat).toBe(1500);
    expect(business.seats).toBe(100);
    expect(business.entitlements.videoCalls).toBe(true);
    expect(business.entitlements.customSubdomain).toBe(true);
    expect(business.entitlements.brandedPortal).toBe(true);
  });

  test("ADVANCED plan is $25/seat/mo with AI features and SSO", () => {
    const advanced = getPlanByCode("ADVANCED")!;
    expect(advanced.priceCentsPerSeat).toBe(2500);
    expect(advanced.seats).toBe(500);
    expect(advanced.entitlements.aiFeatures).toBe(true);
    expect(advanced.entitlements.sso).toBe(true);
    expect(advanced.entitlements.prioritySupport).toBe(true);
  });

  test("ENTERPRISE plan is custom pricing", () => {
    const enterprise = getPlanByCode("ENTERPRISE")!;
    expect(enterprise.isCustom).toBe(true);
    expect(enterprise.entitlements.aiFeatures).toBe(true);
    expect(enterprise.entitlements.sso).toBe(true);
  });

  test("getActivePlans returns only non-legacy active plans", () => {
    const active = getActivePlans();
    expect(active.length).toBe(6);
    expect(active.every(p => !p.isLegacy)).toBe(true);
  });
});

/* ================================================================== */
/*  2. Billing interval discounts                                      */
/* ================================================================== */
describe("Billing Interval Discounts", () => {
  test("STARTER monthly: $5/seat * 5 seats * 1 month = $25", () => {
    const starter = getPlanByCode("STARTER")!;
    const price = priceForInterval(starter, "MONTH", 5);
    expect(price).toBe(2500); // 500 * 5 * 1 * 1.0
  });

  test("STARTER quarterly: 5% discount", () => {
    const starter = getPlanByCode("STARTER")!;
    const price = priceForInterval(starter, "QUARTER", 5);
    // 500 * 5 * 3 * 0.95 = 7125
    expect(price).toBe(7125);
  });

  test("STARTER semi-annual: 10% discount", () => {
    const starter = getPlanByCode("STARTER")!;
    const price = priceForInterval(starter, "SEMIANNUAL", 5);
    // 500 * 5 * 6 * 0.90 = 13500
    expect(price).toBe(13500);
  });

  test("STARTER annual: 20% discount", () => {
    const starter = getPlanByCode("STARTER")!;
    const price = priceForInterval(starter, "ANNUAL", 5);
    // 500 * 5 * 12 * 0.80 = 24000
    expect(price).toBe(24000);
  });

  test("TEAM annual for 10 seats: $9 * 10 * 12 * 0.80 = $864", () => {
    const team = getPlanByCode("TEAM")!;
    const price = priceForInterval(team, "ANNUAL", 10);
    expect(price).toBe(86400);
  });

  test("ENTERPRISE returns 0 (custom pricing)", () => {
    const enterprise = getPlanByCode("ENTERPRISE")!;
    expect(priceForInterval(enterprise, "MONTH")).toBe(0);
  });

  test("FREE returns 0", () => {
    const free = getPlanByCode("FREE")!;
    expect(priceForInterval(free, "ANNUAL")).toBe(0);
  });
});

/* ================================================================== */
/*  3. Add-ons                                                         */
/* ================================================================== */
describe("Add-ons", () => {
  test("7 add-ons defined", () => {
    expect(ADD_ONS.length).toBe(7);
  });

  test("Extra seat is $6/mo", () => {
    const extraSeat = ADD_ONS.find(a => a.code === "extra_seat");
    expect(extraSeat?.priceCentsMonthly).toBe(600);
  });

  test("Priority support is free on Advanced+ plans", () => {
    const priority = ADD_ONS.find(a => a.code === "priority_support");
    expect(priority?.freeOnPlans).toContain("ADVANCED");
    expect(priority?.freeOnPlans).toContain("ENTERPRISE");
  });

  test("SSO is free on Advanced+ plans", () => {
    const sso = ADD_ONS.find(a => a.code === "sso_saml");
    expect(sso?.freeOnPlans).toContain("ADVANCED");
  });
});

/* ================================================================== */
/*  4. Public /subscriptions/plans endpoint                            */
/* ================================================================== */
describe("GET /api/v1/subscriptions/plans", () => {
  test("returns 6 canonical plans (no legacy)", async () => {
    const res = await request(app).get("/api/v1/subscriptions/plans");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    const codes = res.body.data.map((p: any) => p.code);
    expect(codes).toContain("FREE");
    expect(codes).toContain("STARTER");
    expect(codes).toContain("TEAM");
    expect(codes).toContain("BUSINESS");
    expect(codes).toContain("ADVANCED");
    expect(codes).toContain("ENTERPRISE");
    // Legacy codes should NOT appear
    expect(codes).not.toContain("IND-1");
    expect(codes).not.toContain("CO-20");
  });

  test("response includes addons", async () => {
    const res = await request(app).get("/api/v1/subscriptions/plans");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.addons)).toBe(true);
    expect(res.body.addons.length).toBeGreaterThanOrEqual(7);
  });

  test("admin override changes public plan response", async () => {
    // Create an override for STARTER with different price
    await PlanOverride.deleteMany({ code: "STARTER" });
    await PlanOverride.create({
      code: "STARTER",
      name: "Starter (Custom)",
      tagline: "Custom tagline",
      seats: 10,
      priceCentsPerSeat: 400, // $4 instead of $5
      priceCentsMonthly: 400,
      active: true,
      entitlements: { seats: 10, maxSeats: 10, ticketLimit: null },
    });

    const res = await request(app).get("/api/v1/subscriptions/plans");
    expect(res.status).toBe(200);
    const starter = res.body.data.find((p: any) => p.code === "STARTER");
    expect(starter).toBeDefined();
    expect(starter.name).toBe("Starter (Custom)");
    expect(starter.priceCentsPerSeat).toBe(400);
    expect(starter.seats).toBe(10);

    // Cleanup
    await PlanOverride.deleteMany({ code: "STARTER" });
  });
});

/* ================================================================== */
/*  5. Legacy plan codes still resolvable                              */
/* ================================================================== */
describe("Legacy plan backward compatibility", () => {
  test("getPlanByCode can still find legacy plans", () => {
    expect(getPlanByCode("IND-1")).toBeTruthy();
    expect(getPlanByCode("CO-20")).toBeTruthy();
    expect(getPlanByCode("CO-50")).toBeTruthy();
    expect(getPlanByCode("CO-100")).toBeTruthy();
  });

  test("legacy plans are marked isLegacy and inactive", () => {
    const indOne = getPlanByCode("IND-1")!;
    expect(indOne.isLegacy).toBe(true);
    expect(indOne.active).toBe(false);
  });

  test("legacy plans do NOT appear in getActivePlans", () => {
    const active = getActivePlans();
    const legacyCodes = active.filter(p => p.code.startsWith("CO-") || p.code === "IND-1");
    expect(legacyCodes.length).toBe(0);
  });
});
