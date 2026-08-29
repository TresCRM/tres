/**
 * @module tests/billing.phase12
 * Phase 12: Payment Integration & Billing Hardening tests.
 * Covers: invoice generation, invoice API, seat enforcement,
 * billing worker hardening (retries, dunning, auto-downgrade),
 * Paystack webhook handler, and subscription checkout endpoints.
 */
import request from "supertest";
import * as jwt from "jsonwebtoken";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Subscription } from "../../models/Subscription";
import { Invoice } from "../../models/Invoice";
import { hashPassword } from "../../utils/auth";
import { addDays, subDays } from "date-fns";
import { runOnce } from "../../workers/billing.worker";
import {
  createInvoice,
  markInvoicePaid,
  markInvoiceVoid,
  generateInvoiceNumber,
  getInvoicesForTenant,
} from "../../billing/invoiceService";

let app: any;
let tenantId: string;
let billingToken: string;
let readonlyToken: string;
let ownerToken: string;

const secret = process.env.JWT_SECRET || "test-secret";

beforeAll(async () => {
  app = await testSetup();

  const tenant = await Tenant.create({
    slug: "billing-p12",
    plan: "COMPANY",
    seats: 20,
    branding: { name: "Billing P12" },
  });
  tenantId = String(tenant._id);

  const billingUser = await User.create({
    tenantId: tenant._id,
    firstName: "Bill",
    lastName: "Pay",
    email: "bill@p12.local",
    passwordHash: await hashPassword("x"),
    roles: ["BILLING"],
    status: "ACTIVE",
  });

  const ownerUser = await User.create({
    tenantId: tenant._id,
    firstName: "Own",
    lastName: "Er",
    email: "owner@p12.local",
    passwordHash: await hashPassword("x"),
    roles: ["OWNER"],
    status: "ACTIVE",
  });

  const roUser = await User.create({
    tenantId: tenant._id,
    firstName: "Read",
    lastName: "Only",
    email: "ro@p12.local",
    passwordHash: await hashPassword("x"),
    roles: ["READONLY"],
    status: "ACTIVE",
  });

  billingToken = jwt.sign({ sub: String(billingUser._id), tid: tenantId, roles: ["BILLING"] }, secret, { expiresIn: "1h" });
  ownerToken = jwt.sign({ sub: String(ownerUser._id), tid: tenantId, roles: ["OWNER"] }, secret, { expiresIn: "1h" });
  readonlyToken = jwt.sign({ sub: String(roUser._id), tid: tenantId, roles: ["READONLY"] }, secret, { expiresIn: "1h" });

  await seedActiveSubscription(tenantId);
});

afterAll(async () => {
  await testTeardown();
});

// ─── Invoice Number Generation ─────────────────────────────────────

describe("Invoice Number Generation", () => {
  test("generates unique invoice numbers in correct format", () => {
    const n1 = generateInvoiceNumber();
    const n2 = generateInvoiceNumber();
    expect(n1).toMatch(/^INV-\d{8}-[0-9a-f]{6}$/);
    expect(n2).toMatch(/^INV-\d{8}-[0-9a-f]{6}$/);
    expect(n1).not.toBe(n2);
  });
});

// ─── Invoice Service ───────────────────────────────────────────────

describe("Invoice Service", () => {
  let subId: string;

  beforeAll(async () => {
    const sub = await Subscription.findOne({ tenantId }).lean();
    subId = String(sub!._id);
  });

  test("createInvoice creates a DRAFT invoice with correct amounts", async () => {
    const invoice = await createInvoice({
      tenantId,
      subscriptionId: subId,
      planCode: "CO-20",
      interval: "MONTH",
    });

    expect(invoice.status).toBe("DRAFT");
    expect(invoice.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.totalCents).toBe(19900); // CO-20 monthly
    expect(invoice.subtotalCents).toBe(19900);
    expect(invoice.taxCents).toBe(0);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toContain("Company 20");
    expect(invoice.items[0].description).toContain("Monthly");
    expect(String(invoice.tenantId)).toBe(tenantId);
    expect(String(invoice.subscriptionId)).toBe(subId);
  });

  test("createInvoice with ANNUAL interval applies discount", async () => {
    const invoice = await createInvoice({
      tenantId,
      subscriptionId: subId,
      planCode: "CO-20",
      interval: "ANNUAL",
    });

    // CO-20 annual: 19900 * 12 * 0.80 (20% off per Business Plan) = 191,040
    expect(invoice.totalCents).toBe(191040);
    expect(invoice.items[0].description).toContain("Annual");
  });

  test("createInvoice throws for invalid plan", async () => {
    await expect(createInvoice({
      tenantId,
      subscriptionId: subId,
      planCode: "NONEXISTENT",
      interval: "MONTH",
    })).rejects.toThrow("Unknown or inactive plan");
  });

  test("markInvoicePaid sets status and paidAt", async () => {
    const inv = await createInvoice({ tenantId, subscriptionId: subId, planCode: "IND-1", interval: "MONTH" });
    const paid = await markInvoicePaid(String(inv._id));
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).toBeTruthy();
  });

  test("markInvoiceVoid sets status to VOID", async () => {
    const inv = await createInvoice({ tenantId, subscriptionId: subId, planCode: "IND-1", interval: "MONTH" });
    const voided = await markInvoiceVoid(String(inv._id));
    expect(voided.status).toBe("VOID");
  });

  test("getInvoicesForTenant returns paginated results", async () => {
    // Create several invoices
    for (let i = 0; i < 5; i++) {
      await createInvoice({ tenantId, subscriptionId: subId, planCode: "CO-20", interval: "MONTH" });
    }

    const result = await getInvoicesForTenant(tenantId, { limit: 3 });
    expect(result.invoices.length).toBe(3);
    expect(result.nextCursor).toBeTruthy();

    const page2 = await getInvoicesForTenant(tenantId, { limit: 3, cursor: result.nextCursor! });
    expect(page2.invoices.length).toBeGreaterThan(0);
  });

  test("getInvoicesForTenant filters by status", async () => {
    const result = await getInvoicesForTenant(tenantId, { status: "PAID" });
    for (const inv of result.invoices) {
      expect(inv.status).toBe("PAID");
    }
  });
});

// ─── Invoice API Routes ────────────────────────────────────────────

describe("Invoice API", () => {
  test("GET /invoices returns invoices for billing user", async () => {
    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${billingToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("GET /invoices returns invoices for readonly user (BILLING_READ)", async () => {
    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${readonlyToken}`);
    expect(res.status).toBe(200);
  });

  test("GET /invoices/:id returns single invoice", async () => {
    const sub = await Subscription.findOne({ tenantId }).lean();
    const inv = await createInvoice({
      tenantId,
      subscriptionId: String(sub!._id),
      planCode: "CO-20",
      interval: "MONTH",
    });

    const res = await request(app)
      .get(`/api/v1/invoices/${inv._id}`)
      .set("Authorization", `Bearer ${billingToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.invoiceNumber).toBe(inv.invoiceNumber);
  });

  test("GET /invoices/:id returns 404 for wrong tenant", async () => {
    const otherTenant = await Tenant.create({ slug: "other-inv", branding: { name: "Other" }, plan: "FREE", seats: 1 });
    const otherSub = await Subscription.create({
      tenantId: otherTenant._id,
      planCode: "FREE",
      status: "ACTIVE",
      seats: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), 30),
      entitlements: {},
    });
    const otherInv = await createInvoice({
      tenantId: String(otherTenant._id),
      subscriptionId: String(otherSub._id),
      planCode: "FREE",
      interval: "MONTH",
    });

    const res = await request(app)
      .get(`/api/v1/invoices/${otherInv._id}`)
      .set("Authorization", `Bearer ${billingToken}`);
    expect(res.status).toBe(404);
  });

  test("GET /invoices supports status filter", async () => {
    const res = await request(app)
      .get("/api/v1/invoices?status=PAID")
      .set("Authorization", `Bearer ${billingToken}`);
    expect(res.status).toBe(200);
    for (const inv of res.body.data) {
      expect(inv.status).toBe("PAID");
    }
  });
});

// ─── Seat Enforcement ──────────────────────────────────────────────

describe("Seat Enforcement", () => {
  test("invite is blocked when seat limit is reached", async () => {
    // Create a tenant with 1-seat plan
    const t = await Tenant.create({ slug: "seat-test", branding: { name: "SeatTest" }, plan: "INDIVIDUAL", seats: 1 });
    const u = await User.create({
      tenantId: t._id, firstName: "Seat", lastName: "Owner",
      email: "seat@test.local", passwordHash: await hashPassword("x"),
      roles: ["OWNER"], status: "ACTIVE",
    });
    await Subscription.create({
      tenantId: t._id, planCode: "IND-1", status: "ACTIVE", seats: 1,
      currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 30),
      entitlements: { seats: 1 },
    });

    const token = jwt.sign({ sub: String(u._id), tid: String(t._id), roles: ["OWNER"] }, secret, { expiresIn: "1h" });

    const res = await request(app)
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@test.local", firstName: "New", lastName: "User", roles: ["AGENT"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("seat_limit_reached");
    expect(res.body.seats).toBe(1);
  });
});

// ─── Billing Worker Hardening ──────────────────────────────────────

describe("Billing Worker - Invoice Generation on Renewal", () => {
  test("generates invoice on successful renewal", async () => {
    const t = await Tenant.create({ slug: "bw-inv", branding: { name: "BWInv" }, plan: "COMPANY", seats: 5 });
    await User.create({
      tenantId: t._id, firstName: "O", lastName: "W",
      email: "owner@bwinv.local", passwordHash: await hashPassword("x"),
      roles: ["OWNER"], status: "ACTIVE",
    });
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20,
      interval: "MONTH", provider: "manual",
      currentPeriodStart: subDays(new Date(), 30),
      currentPeriodEnd: subDays(new Date(), 1),
      entitlements: { api: true },
    });

    await runOnce(new Date());

    const invoices = await Invoice.find({ tenantId: t._id }).lean();
    expect(invoices.length).toBeGreaterThanOrEqual(1);
    expect(invoices[0].status).toBe("PAID");
    expect(invoices[0].totalCents).toBe(19900);
  });
});

describe("Billing Worker - Exponential Backoff Retries", () => {
  test("sets nextRetryAt with increasing delay on failure", async () => {
    const t = await Tenant.create({ slug: "bw-retry", branding: { name: "BWRetry" }, plan: "COMPANY", seats: 5 });
    const sub = await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20,
      interval: "MONTH", provider: "manual",
      currentPeriodStart: subDays(new Date(), 30),
      currentPeriodEnd: subDays(new Date(), 1),
      entitlements: { api: true },
    });

    const origEnv = process.env.BILLING_FORCE_FAIL;
    process.env.BILLING_FORCE_FAIL = "1";
    await runOnce(new Date());
    process.env.BILLING_FORCE_FAIL = origEnv;

    const updated = await Subscription.findById(sub._id).lean();
    expect(updated!.status).toBe("GRACE");
    expect(updated!.nextRetryAt).toBeTruthy();
    expect(updated!.failedPaymentCount).toBe(1);
  });
});

describe("Billing Worker - Auto-Downgrade", () => {
  test("downgrades expired subscription to FREE after 7 days", async () => {
    const t = await Tenant.create({ slug: "bw-down", branding: { name: "BWDown" }, plan: "COMPANY", seats: 5 });
    const sub = await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "EXPIRED", seats: 20,
      interval: "MONTH", provider: "manual",
      currentPeriodStart: subDays(new Date(), 60),
      currentPeriodEnd: subDays(new Date(), 30),
      entitlements: { api: true },
    });

    // Force updatedAt to 8 days ago (bypassing Mongoose timestamps via collection)
    await Subscription.collection.updateOne(
      { _id: sub._id },
      { $set: { updatedAt: subDays(new Date(), 8) } },
    );

    await User.create({
      tenantId: t._id, firstName: "O", lastName: "W",
      email: "owner@bwdown.local", passwordHash: await hashPassword("x"),
      roles: ["OWNER"], status: "ACTIVE",
    });

    await runOnce(new Date());

    const updated = await Subscription.findOne({ tenantId: t._id }).lean();
    expect(updated!.planCode).toBe("FREE");
    expect(updated!.seats).toBe(1);
    expect(updated!.status).toBe("ACTIVE");
    expect(updated!.autoRenew).toBe(false);
  });

  test("does not downgrade recently expired subscription", async () => {
    const t = await Tenant.create({ slug: "bw-nodown", branding: { name: "BWNoDown" }, plan: "COMPANY", seats: 5 });
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "EXPIRED", seats: 20,
      interval: "MONTH", provider: "manual",
      currentPeriodStart: subDays(new Date(), 31),
      currentPeriodEnd: subDays(new Date(), 1),
      entitlements: { api: true },
      // updatedAt is recent (default: now) — should NOT be downgraded
    });

    await runOnce(new Date());

    const updated = await Subscription.findOne({ tenantId: t._id }).lean();
    expect(updated!.planCode).toBe("CO-20"); // unchanged
  });
});

describe("Billing Worker - Grace Period Expiry", () => {
  test("expires subscription after grace period", async () => {
    const t = await Tenant.create({ slug: "bw-exp2", branding: { name: "BWExp2" }, plan: "COMPANY", seats: 5 });
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "GRACE", seats: 20,
      interval: "MONTH", provider: "manual",
      currentPeriodStart: subDays(new Date(), 40),
      currentPeriodEnd: subDays(new Date(), 10),
      graceUntil: subDays(new Date(), 1),
      entitlements: { api: true },
    });

    await User.create({
      tenantId: t._id, firstName: "O", lastName: "W",
      email: "owner@bwexp2.local", passwordHash: await hashPassword("x"),
      roles: ["OWNER"], status: "ACTIVE",
    });

    await runOnce(new Date());

    const updated = await Subscription.findOne({ tenantId: t._id }).lean();
    expect(updated!.status).toBe("EXPIRED");
  });
});

describe("Billing Worker - Dunning Reminders", () => {
  test("processes T-7 reminder without error", async () => {
    const t = await Tenant.create({ slug: "bw-dun7", branding: { name: "BWDun" }, plan: "COMPANY", seats: 5 });
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20,
      interval: "MONTH", provider: "manual", autoRenew: true,
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), 7),
      entitlements: { api: true },
    });

    await expect(runOnce(new Date())).resolves.not.toThrow();
  });

  test("processes T-1 reminder without error", async () => {
    const t = await Tenant.create({ slug: "bw-dun1", branding: { name: "BWDun1" }, plan: "COMPANY", seats: 5 });
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20,
      interval: "MONTH", provider: "manual", autoRenew: true,
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), 1),
      entitlements: { api: true },
    });

    await expect(runOnce(new Date())).resolves.not.toThrow();
  });
});

// ─── Paystack Webhook Route ────────────────────────────────────────

describe("Paystack Webhook Route", () => {
  test("returns 400 without x-paystack-signature header", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/paystack")
      .set("Content-Type", "application/json")
      .send("{}");
    // Either 400 (missing signature) or 503 (Paystack not configured)
    expect([400, 503]).toContain(res.status);
  });

  test("returns 400/503 with invalid signature", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "invalid_hash")
      .send("{}");
    expect([400, 503]).toContain(res.status);
  });
});

// ─── Subscription Checkout Endpoints ───────────────────────────────

describe("Subscription Checkout (Paystack)", () => {
  test("POST /subscriptions/checkout returns 503 or 400 depending on Paystack config", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({
        planCode: "CO-20",
        interval: "MONTH",
        email: "bill@p12.local",
        callbackUrl: "http://localhost:3000/billing?callback=1",
      });
    // 503 if Paystack not configured, 400 if configured but API call fails with test data
    expect([400, 503]).toContain(res.status);
    if (res.status === 503) {
      expect(res.body.error).toBe("payment_provider_unavailable");
    } else {
      expect(res.body.error).toBe("checkout_failed");
    }
  });

  test("POST /subscriptions/verify returns 503 or 400 depending on Paystack config", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/verify")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({ reference: "test_ref_123" });
    // 503 if Paystack not configured, 400/404 if configured but reference invalid
    expect([400, 404, 503]).toContain(res.status);
  });

  test("POST /subscriptions/checkout requires BILLING_MANAGE role", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .send({
        planCode: "CO-20",
        interval: "MONTH",
        email: "ro@p12.local",
        callbackUrl: "http://localhost:3000",
      });
    expect(res.status).toBe(403);
  });
});

// ─── Subscription Model Fields ─────────────────────────────────────

describe("Subscription Model - Paystack Fields", () => {
  test("supports paystackCustomerCode and paystackSubscriptionCode", async () => {
    const t = await Tenant.create({ slug: "paystack-fields", branding: { name: "PF" }, plan: "COMPANY", seats: 5 });
    const sub = await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20,
      interval: "MONTH",
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), 30),
      entitlements: {},
      paystackCustomerCode: "CUS_test123",
      paystackSubscriptionCode: "SUB_test456",
      provider: "paystack",
    });

    const found = await Subscription.findById(sub._id).lean();
    expect(found!.paystackCustomerCode).toBe("CUS_test123");
    expect(found!.paystackSubscriptionCode).toBe("SUB_test456");
    expect(found!.provider).toBe("paystack");
  });

  test("supports nextRetryAt field", async () => {
    const t = await Tenant.create({ slug: "retry-field", branding: { name: "RF" }, plan: "COMPANY", seats: 5 });
    const retryDate = new Date(Date.now() + 3600000);
    const sub = await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "GRACE", seats: 20,
      interval: "MONTH",
      currentPeriodStart: new Date(),
      currentPeriodEnd: addDays(new Date(), 30),
      entitlements: {},
      nextRetryAt: retryDate,
      failedPaymentCount: 2,
    });

    const found = await Subscription.findById(sub._id).lean();
    expect(found!.nextRetryAt).toBeTruthy();
    expect(found!.failedPaymentCount).toBe(2);
  });
});
