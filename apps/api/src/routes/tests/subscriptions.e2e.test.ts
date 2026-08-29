import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Plan } from "../../models/Plan";
import { Subscription } from "../../models/Subscription";
import { hashPassword } from "../../utils/auth";
import { seedActiveSubscription } from "../../tests/helpers";

let app: any;
let tenantId: string;
let billingUserId: string;
let readonlyUserId: string;
let billingToken: string;
let readonlyToken: string;

beforeAll(async () => {
  app = await testSetup();

  // Seed tenant
  const tenant = await Tenant.create({
    slug: "trescrm",
    plan: "COMPANY",
    seats: 20,
    branding: { name: "TRES CRM" }
  });
  tenantId = String(tenant._id);

  // Seed users (one with BILLING role, one READONLY)
  const billingUser = await User.create({
    tenantId: tenant._id,
    firstName: "Bill",
    lastName: " Ing",
    email: "billing@trescrm.local",
    passwordHash: await hashPassword("x"),
    roles: ["BILLING"],
    status: "ACTIVE"
  });
  billingUserId = String(billingUser._id);

  const roUser = await User.create({
    tenantId: tenant._id,
    firstName: "Read",
    lastName: " Only",
    email: "ro@trescrm.local",
    passwordHash: await hashPassword("x"),
    roles: ["READONLY"],
    status: "ACTIVE"
  });
  readonlyUserId = String(roUser._id);

  // JWTs
  const secret = process.env.JWT_SECRET || "test-secret";
  billingToken = jwt.sign(
    { sub: billingUserId, tid: tenantId, roles: ["BILLING"] },
    secret,
    { expiresIn: "1h" }
  );
  readonlyToken = jwt.sign(
    { sub: readonlyUserId, tid: tenantId, roles: ["READONLY"] },
    secret,
    { expiresIn: "1h" }
  );

  // Seed plans (2 active, 1 inactive)
  await seedActiveSubscription(tenantId);
  await Plan.create([
    { code: "IND-1", name: "Individual", seats: 1, priceMonthly: 0, active: true },
    { code: "CO-20", name: "Company 20", seats: 20, priceMonthly: 99, active: true },
    { code: "OLD-10", name: "Old Ten", seats: 10, priceMonthly: 49, active: false }
  ]);
});

afterAll(async () => {
  await testTeardown();
});

describe("Subscriptions API", () => {
  test("GET /api/v1/subscriptions/plans returns only active plans", async () => {
    const res = await request(app).get("/api/v1/subscriptions/plans").expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Plans come from hardcoded PLANS array in billing/plans.ts, not DB
    // Canonical plans: FREE, STARTER, TEAM, BUSINESS, ADVANCED, ENTERPRISE
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    const codes = res.body.data.map((p: any) => p.code);
    expect(codes).toContain("FREE");
    expect(codes).toContain("STARTER");
    expect(codes).toContain("TEAM");
    expect(codes).toContain("BUSINESS");
    expect(codes).toContain("ADVANCED");
    expect(codes).toContain("ENTERPRISE");
    // Every returned plan should be active
    expect(res.body.data.every((p: any) => p.active)).toBe(true);
    // Legacy plans should not appear (they are active:false and isLegacy:true)
    expect(codes).not.toContain("IND-1");
    expect(codes).not.toContain("CO-20");
  });

  test("POST /api/v1/subscriptions requires auth (401)", async () => {
    await request(app)
      .post("/api/v1/subscriptions")
      .send({ planCode: "CO-20", prepayMonths: 1 })
      .expect(401);
  });

  test("POST /api/v1/subscriptions forbids READONLY (403)", async () => {
    await request(app)
      .post("/api/v1/subscriptions")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .send({ planCode: "CO-20", prepayMonths: 1  })
      .expect(403);
  });

  test("POST /api/v1/subscriptions invalid plan -> 400", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({ 
        planCode: "DOES_NOT_EXIST",
        prepayMonths: 1,
        tenantId: tenantId,
        status: "ACTIVE",
        interval: "MONTH",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: "2025-11-13T01:18:00.000Z",
        graceUntil: null,
        canceledAt: null,
        provider: "manual",
        lastPaymentAt: null,
        seats: 20,
        failedPaymentCount: 0,
        entitlements: {}
       })
      .expect(400);

    // Optional: verify our standard error envelope
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_plan"); // or "invalid_plan" if you throw ERR.BAD_REQUEST("invalid_plan")
  });

  test("POST /api/v1/subscriptions happy path -> 201, then GET /me returns it", async () => {
    const created = await request(app)
      .post("/api/v1/subscriptions")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({ 
        planCode: "CO-20", 
        prepayMonths: 1,
        tenantId: tenantId,
        status: "ACTIVE",
        interval: "MONTH",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: "2025-11-13T01:18:00.000Z",
        graceUntil: null,
        canceledAt: null,
        provider: "manual",
        lastPaymentAt: null,
        seats: 20,
        failedPaymentCount: 0,
        entitlements: {}
      })
      .expect(201);

    expect(created.body.data.planCode).toBe("CO-20");
    expect(created.body.data.status).toBe("ACTIVE");
    expect(new Date(created.body.data.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());

    const me = await request(app)
      .get("/api/v1/subscriptions/me")
      .set("Authorization", `Bearer ${billingToken}`)
      .expect(200);

    expect(me.body.data).toBeTruthy();
    expect(me.body.data.planCode).toBe("CO-20");

    // Also verify in DB (safety)
    const subDoc = await Subscription.findOne({ tenantId }).lean();
    expect(subDoc?.planCode).toBe("CO-20");
    expect(subDoc?.status).toBe("ACTIVE");
  });

  test("Switching plans updates existing subscription (upsert behavior)", async () => {
    const first = await Subscription.findOne({ tenantId }).lean();
    expect(first).toBeTruthy();

    // Switch to IND-1
    const sw = await request(app)
      .post("/api/v1/subscriptions")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({ 
        planCode: "IND-1", 
        prepayMonths: 1,
        tenantId: tenantId,
        status: "ACTIVE",
        interval: "MONTH",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: "2025-11-13T01:18:00.000Z",
        graceUntil: null,
        canceledAt: null,
        provider: "manual",
        lastPaymentAt: null,
        seats: 20,
        failedPaymentCount: 0,
        entitlements: {}
       })
      .expect(201);

    expect(sw.body.data.planCode).toBe("IND-1");

    const after = await Subscription.find({ tenantId }).lean();
    expect(after.length).toBe(1); // still a single doc, was updated
    expect(after[0].planCode).toBe("IND-1");
    expect(new Date(after[0].currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
  });
});
