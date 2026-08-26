/**
 * @module tests/hardening.paystack-idempotency
 * Regression tests for HARDENINGS.md section 6 — webhook replay safety.
 *
 * Paystack retries until it sees a 2xx, so every delivery of the same event
 * must produce the same result: one billing period extension, one invoice.
 */
import crypto from "crypto";
import request from "supertest";
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { Subscription } from "../../models/Subscription";
import { Invoice } from "../../models/Invoice";
import { ProcessedWebhookEvent } from "../../models/ProcessedWebhookEvent";
import { resetAiProvider } from "../../services/ai/ai-provider";

const SECRET = "sk_test_webhook_idempotency";
const savedKey = process.env.PAYSTACK_SECRET_KEY;

let app: any;
let slugCounter = 0;

beforeAll(async () => {
  // The provider factory memoises, and paystackWebhook resolves it per request,
  // so the key must be in place before the first call.
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  app = await testSetup();
});

afterAll(async () => {
  if (savedKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = savedKey;
  resetAiProvider();
  await testTeardown();
});

afterEach(async () => {
  await ProcessedWebhookEvent.deleteMany({});
  await Invoice.deleteMany({});
  await Subscription.deleteMany({});
  await Tenant.deleteMany({});
});

async function makeTenant() {
  const slug = `pw-${slugCounter++}`;
  return Tenant.create({
    slug,
    branding: { name: slug },
    plan: "COMPANY",
    seats: 5,
  });
}

/** Post a signed charge.success exactly as Paystack would. */
function postEvent(payload: Record<string, any>) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha512", SECRET).update(body).digest("hex");

  return request(app)
    .post("/api/v1/webhooks/paystack")
    .set("Content-Type", "application/json")
    .set("x-paystack-signature", signature)
    .send(body);
}

function chargeSuccess(tenantId: string, overrides: Record<string, any> = {}) {
  return {
    event: "charge.success",
    data: {
      id: 900001,
      reference: "ref_charge_1",
      amount: 1990000,
      customer: { customer_code: "CUS_test" },
      metadata: {
        tenantId,
        tenantSlug: "acme",
        planCode: "TEAM",
        interval: "MONTH",
      },
      ...overrides,
    },
  };
}

describe("paystack webhook — signature", () => {
  test("rejects a request with no signature header", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/paystack")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "charge.success", data: {} }));

    expect(res.status).toBe(400);
  });

  test("rejects a bad signature", async () => {
    const body = JSON.stringify({ event: "charge.success", data: {} });

    const res = await request(app)
      .post("/api/v1/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "deadbeef")
      .send(body);

    expect(res.status).toBe(400);
  });

  test("an unsigned request is not recorded as processed", async () => {
    await request(app)
      .post("/api/v1/webhooks/paystack")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "charge.success", data: {} }));

    expect(await ProcessedWebhookEvent.countDocuments({})).toBe(0);
  });
});

describe("paystack webhook — replay safety", () => {
  test("a first delivery is accepted and recorded", async () => {
    const tenant = await makeTenant();

    const res = await postEvent(chargeSuccess(String(tenant._id)));

    expect(res.status).toBe(200);
    const claimed = await ProcessedWebhookEvent.findOne({ provider: "paystack" }).lean();
    expect(claimed!.eventKey).toBe("900001");
    expect(claimed!.eventType).toBe("charge.success");
  });

  test("a redelivery is acknowledged without reprocessing", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));
    const second = await postEvent(chargeSuccess(String(tenant._id)));

    expect(second.status).toBe(200);
    expect(await ProcessedWebhookEvent.countDocuments({ provider: "paystack" })).toBe(1);
  });

  test("a redelivered charge does not raise a second invoice", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));
    const afterFirst = await Invoice.countDocuments({});

    await postEvent(chargeSuccess(String(tenant._id)));
    await postEvent(chargeSuccess(String(tenant._id)));

    expect(afterFirst).toBe(1);
    expect(await Invoice.countDocuments({})).toBe(1);
  });

  test("a redelivered charge does not extend the period again", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));
    const first = await Subscription.findOne({ tenantId: tenant._id }).lean();

    await postEvent(chargeSuccess(String(tenant._id)));
    const second = await Subscription.findOne({ tenantId: tenant._id }).lean();

    expect(second!.currentPeriodEnd.getTime()).toBe(first!.currentPeriodEnd.getTime());
  });

  test("a genuinely different event is processed on its own merits", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));
    const res = await postEvent(
      chargeSuccess(String(tenant._id), { id: 900002, reference: "ref_charge_2" })
    );

    expect(res.status).toBe(200);
    expect(await ProcessedWebhookEvent.countDocuments({ provider: "paystack" })).toBe(2);
  });

  test("events are keyed per provider event id, not per tenant", async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);

    await postEvent(chargeSuccess(String(a._id)));
    // Same provider event id arriving again, even naming another tenant, is a
    // replay of one event and must not be applied twice.
    await postEvent(chargeSuccess(String(b._id)));

    expect(await ProcessedWebhookEvent.countDocuments({ provider: "paystack" })).toBe(1);
  });
});

describe("paystack webhook — invoice dedupe by reference", () => {
  test("the invoice records the provider reference", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));

    const invoice = await Invoice.findOne({}).lean();
    expect(invoice!.providerReference).toBe("ref_charge_1");
  });

  test("a repeat charge with the same reference reuses the existing invoice", async () => {
    const tenant = await makeTenant();

    // Same transaction reference, different provider event id — so the
    // idempotency claim does not fire and the reference guard has to.
    await postEvent(chargeSuccess(String(tenant._id)));
    await postEvent(chargeSuccess(String(tenant._id), { id: 900003 }));

    expect(await Invoice.countDocuments({ providerReference: "ref_charge_1" })).toBe(1);
  });

  test("a different reference raises its own invoice", async () => {
    const tenant = await makeTenant();

    await postEvent(chargeSuccess(String(tenant._id)));
    await postEvent(
      chargeSuccess(String(tenant._id), { id: 900004, reference: "ref_charge_9" })
    );

    expect(await Invoice.countDocuments({})).toBe(2);
  });
});

describe("paystack webhook — unhandled and malformed events", () => {
  test("an unrecognised event type is acknowledged", async () => {
    const res = await postEvent({ event: "customer.identification.failed", data: { id: 1 } });

    expect(res.status).toBe(200);
  });

  test("charge.success without a tenantId does not create a subscription", async () => {
    const res = await postEvent({
      event: "charge.success",
      data: { id: 910001, reference: "ref_no_tenant", metadata: {} },
    });

    expect(res.status).toBe(200);
    expect(await Subscription.countDocuments({})).toBe(0);
  });

  test("charge.success naming an unknown plan does not create an invoice", async () => {
    const tenant = await makeTenant();

    const res = await postEvent(
      chargeSuccess(String(tenant._id), {
        id: 910002,
        metadata: {
          tenantId: String(tenant._id),
          planCode: "NO-SUCH-PLAN",
          interval: "MONTH",
        },
      })
    );

    expect(res.status).toBe(200);
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  test("an event for a tenant that does not exist is still acknowledged", async () => {
    const res = await postEvent(chargeSuccess(String(new Types.ObjectId()), { id: 910003 }));

    expect(res.status).toBe(200);
  });
});

describe("paystack webhook — payment failure must name a tenant", () => {
  test("a failure carrying a tenantId moves that subscription to GRACE", async () => {
    const tenant = await makeTenant();
    await postEvent(chargeSuccess(String(tenant._id)));

    const res = await postEvent({
      event: "invoice.payment_failed",
      data: {
        id: 920001,
        customer: { customer_code: "CUS_test" },
        metadata: { tenantId: String(tenant._id) },
      },
    });

    expect(res.status).toBe(200);
    const sub = await Subscription.findOne({ tenantId: tenant._id }).lean();
    expect(sub!.status).toBe("GRACE");
  });

  test("a failure with no tenantId does not fall back to the customer code", async () => {
    // The subscription stores paystackCustomerCode CUS_test, so a customer-code
    // fallback would find and downgrade it. Metadata is the only trusted source.
    const tenant = await makeTenant();
    await postEvent(chargeSuccess(String(tenant._id)));

    const res = await postEvent({
      event: "invoice.payment_failed",
      data: {
        id: 920002,
        customer: { customer_code: "CUS_test" },
        metadata: {},
      },
    });

    expect(res.status).toBe(200);
    const sub = await Subscription.findOne({ tenantId: tenant._id }).lean();
    expect(sub!.status).toBe("ACTIVE");
    expect(sub!.failedPaymentCount).toBe(0);
  });

  test("a failure naming an unknown tenant changes nothing", async () => {
    const tenant = await makeTenant();
    await postEvent(chargeSuccess(String(tenant._id)));

    await postEvent({
      event: "invoice.payment_failed",
      data: {
        id: 920003,
        customer: { customer_code: "CUS_test" },
        metadata: { tenantId: String(new Types.ObjectId()) },
      },
    });

    const sub = await Subscription.findOne({ tenantId: tenant._id }).lean();
    expect(sub!.status).toBe("ACTIVE");
  });
});
