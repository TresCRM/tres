import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { Subscription } from "../../models/Subscription";
import { runOnce } from "../../workers/billing.worker";

beforeAll(async () => { await testSetup(); });
afterAll(async () => { await testTeardown(); });

test("renewal success -> extends period", async () => {
  const t = await Tenant.create({ slug:"r1", plan:"COMPANY", seats:20, branding:{ name:"TRES" } });
  const now = new Date();
  await Subscription.create({
    tenantId: t._id, 
    planCode:"CO-20", 
    interval:"MONTH", 
    seats:20, 
    status:"ACTIVE",
    currentPeriodStart: new Date(now.getTime() - 31*86400000),
    currentPeriodEnd: new Date(now.getTime() - 1000), 
    graceUntil: null
  });
  delete process.env.BILLING_FORCE_FAIL;
  await runOnce(now);
  const sub = await Subscription.findOne({ tenantId: t._id }).lean();
  expect(sub!.status).toBe("ACTIVE");
  expect(sub!.currentPeriodEnd.getTime()).toBeGreaterThan(now.getTime());
});

test("renewal fail -> GRACE; after grace -> EXPIRED", async () => {
  const t = await Tenant.create({ slug:"r2", plan:"COMPANY", seats:20, branding:{ name:"TRES" } });
  const now = new Date();
  await Subscription.create({
    tenantId: t._id, planCode:"CO-20", interval:"MONTH", seats:20, status:"ACTIVE",
    currentPeriodStart: new Date(now.getTime() - 31*86400000),
    currentPeriodEnd: new Date(now.getTime() - 1000), graceUntil: null
  });

  process.env.BILLING_FORCE_FAIL = "1";
  await runOnce(now);
  let sub = await Subscription.findOne({ tenantId: t._id }).lean();
  expect(sub!.status).toBe("GRACE");
  expect(sub!.graceUntil!.getTime()).toBeGreaterThan(now.getTime());

  // Simulate grace end
  await Subscription.updateOne({ tenantId: t._id }, { $set: { graceUntil: new Date(now.getTime() - 1000) } });
  await runOnce(now);
  sub = await Subscription.findOne({ tenantId: t._id }).lean();
  expect(sub!.status).toBe("EXPIRED");
});
