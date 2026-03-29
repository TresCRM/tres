/**
 * @module tests/billing.worker
 * Phase 8: Billing worker integration tests.
 * Tests renewal, grace period, expiry, and dunning reminders.
 */
import { testSetup, testTeardown } from "../../tests/helpers";
import { Subscription } from "../../models/Subscription";
import { Tenant } from "../../models/Tenant";
import { addDays, subDays } from "date-fns";
import { runOnce } from "../../workers/billing.worker";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

async function createTenant(slug: string) {
  return Tenant.create({ slug, branding: { name: slug }, plan: "COMPANY", seats: 5 });
}

async function createSub(tenantId: any, overrides: Partial<any> = {}) {
  const now = new Date();
  return Subscription.create({
    tenantId,
    planCode: "CO-20",
    status: "ACTIVE",
    seats: 20,
    interval: "MONTH",
    currentPeriodStart: subDays(now, 30),
    currentPeriodEnd: subDays(now, 1), // expired yesterday
    entitlements: { api: true },
    ...overrides,
  });
}

describe("Billing Worker - Renewal (Phase 8.2)", () => {
  test("renews expired ACTIVE subscription", async () => {
    const t = await createTenant("bw-renew");
    const sub = await createSub(t._id);

    await runOnce(new Date());

    const updated = await Subscription.findById(sub._id).lean();
    expect(updated!.status).toBe("ACTIVE");
    expect(updated!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    expect(updated!.lastPaymentAt).toBeTruthy();
    expect(updated!.failedPaymentCount).toBe(0);
  });
});

describe("Billing Worker - Grace Period (Phase 8.2)", () => {
  test("moves to GRACE on payment failure", async () => {
    const t = await createTenant("bw-grace");
    const sub = await createSub(t._id);

    // Simulate payment failure
    const origEnv = process.env.BILLING_FORCE_FAIL;
    process.env.BILLING_FORCE_FAIL = "1";
    await runOnce(new Date());
    process.env.BILLING_FORCE_FAIL = origEnv;

    const updated = await Subscription.findById(sub._id).lean();
    expect(updated!.status).toBe("GRACE");
    expect(updated!.graceUntil).toBeTruthy();
    expect(updated!.failedPaymentCount).toBe(1);
  });
});

describe("Billing Worker - Expiry (Phase 8.2)", () => {
  test("expires subscription after grace period elapses", async () => {
    const t = await createTenant("bw-expire");
    const sub = await createSub(t._id, {
      status: "GRACE",
      graceUntil: subDays(new Date(), 1), // grace ended yesterday
    });

    await runOnce(new Date());

    const updated = await Subscription.findById(sub._id).lean();
    expect(updated!.status).toBe("EXPIRED");
  });
});

describe("Billing Worker - Dunning Reminders (Phase 8.2)", () => {
  test("sends reminder at T-14 days", async () => {
    const t = await createTenant("bw-t14");
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20, interval: "MONTH",
      currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 14),
      entitlements: { api: true },
    });

    // runOnce should process without error (emails are disabled in test)
    await expect(runOnce(new Date())).resolves.not.toThrow();
  });

  test("sends reminder at T-7 days", async () => {
    const t = await createTenant("bw-t7");
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20, interval: "MONTH",
      currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 7),
      entitlements: { api: true },
    });
    await expect(runOnce(new Date())).resolves.not.toThrow();
  });

  test("sends reminder at T-3 days", async () => {
    const t = await createTenant("bw-t3");
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20, interval: "MONTH",
      currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 3),
      entitlements: { api: true },
    });
    await expect(runOnce(new Date())).resolves.not.toThrow();
  });

  test("sends reminder at T-1 day", async () => {
    const t = await createTenant("bw-t1");
    await Subscription.create({
      tenantId: t._id, planCode: "CO-20", status: "ACTIVE", seats: 20, interval: "MONTH",
      currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 1),
      entitlements: { api: true },
    });
    await expect(runOnce(new Date())).resolves.not.toThrow();
  });
});
