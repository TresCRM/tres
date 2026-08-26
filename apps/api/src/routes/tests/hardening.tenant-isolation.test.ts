/**
 * @module tests/hardening.tenant-isolation
 * Regression tests for HARDENINGS.md section 2 (multi-tenancy isolation).
 *
 * The same email address routinely exists as a customer under many tenants, so
 * any write keyed on email alone crosses a tenant boundary.
 */
import request from "supertest";
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Customer } from "../../models/Customer";
import { EmailMessage } from "../../models/EmailMessage";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const SHARED_EMAIL = "shared@customer.test";

afterEach(async () => {
  await Customer.deleteMany({});
  await EmailMessage.deleteMany({});
});

async function seedCustomerFor(tenantId: Types.ObjectId) {
  return Customer.create({ tenantId, email: SHARED_EMAIL, name: "Shared Customer" });
}

function hardBounce(body: Record<string, any>) {
  return request(app)
    .post("/api/v1/email-tracking/webhook")
    .send({
      event: "bounced",
      bounceType: "hard",
      email: SHARED_EMAIL,
      reason: "mailbox does not exist",
      ...body,
    });
}

async function bouncedFlag(tenantId: Types.ObjectId): Promise<boolean> {
  const doc = await Customer.findOne({ tenantId, email: SHARED_EMAIL }).lean();
  return !!doc?.emailBounced;
}

describe("email tracking — hard bounce is scoped to one tenant", () => {
  test("an explicit tenantId flags only that tenant's customer", async () => {
    await seedCustomerFor(tenantA);
    await seedCustomerFor(tenantB);

    const res = await hardBounce({ tenantId: String(tenantA) });
    expect(res.status).toBe(200);

    expect(await bouncedFlag(tenantA)).toBe(true);
    expect(await bouncedFlag(tenantB)).toBe(false);
  });

  test("the tenant is resolved from the recorded outbound message", async () => {
    await seedCustomerFor(tenantA);
    await seedCustomerFor(tenantB);
    await EmailMessage.create({
      tenantId: tenantA,
      to: [SHARED_EMAIL],
      subject: "Your ticket",
      providerId: "provider-msg-1",
      status: "SENT",
    });

    const res = await hardBounce({ messageId: "provider-msg-1" });
    expect(res.status).toBe(200);

    expect(await bouncedFlag(tenantA)).toBe(true);
    expect(await bouncedFlag(tenantB)).toBe(false);
  });

  test("no tenant can be resolved -> no customer is flagged at all", async () => {
    await seedCustomerFor(tenantA);
    await seedCustomerFor(tenantB);

    const res = await hardBounce({});
    expect(res.status).toBe(200);

    expect(await bouncedFlag(tenantA)).toBe(false);
    expect(await bouncedFlag(tenantB)).toBe(false);
  });

  test("an unknown messageId does not fall back to an unscoped write", async () => {
    await seedCustomerFor(tenantA);
    await seedCustomerFor(tenantB);

    await hardBounce({ messageId: "no-such-message" });

    expect(await Customer.countDocuments({ emailBounced: true })).toBe(0);
  });

  test("a malformed tenantId does not fall back to an unscoped write", async () => {
    await seedCustomerFor(tenantA);
    await seedCustomerFor(tenantB);

    await hardBounce({ tenantId: "not-an-object-id" });

    expect(await Customer.countDocuments({ emailBounced: true })).toBe(0);
  });

  test("records the bounce reason alongside the flag", async () => {
    await seedCustomerFor(tenantA);

    await hardBounce({ tenantId: String(tenantA) });

    const doc = await Customer.findOne({ tenantId: tenantA }).lean();
    expect(doc!.bounceReason).toBe("mailbox does not exist");
    expect(doc!.emailBouncedAt).toBeTruthy();
  });
});

describe("email tracking — non-bounce events", () => {
  test("a soft bounce does not flag the address", async () => {
    await seedCustomerFor(tenantA);

    const res = await request(app).post("/api/v1/email-tracking/webhook").send({
      event: "bounced",
      bounceType: "soft",
      email: SHARED_EMAIL,
      tenantId: String(tenantA),
    });

    expect(res.status).toBe(200);
    expect(await bouncedFlag(tenantA)).toBe(false);
  });

  test("a delivered event does not flag the address", async () => {
    await seedCustomerFor(tenantA);

    await request(app)
      .post("/api/v1/email-tracking/webhook")
      .send({ event: "delivered", email: SHARED_EMAIL, tenantId: String(tenantA) });

    expect(await bouncedFlag(tenantA)).toBe(false);
  });

  test("a complaint is accepted without mutating customers", async () => {
    await seedCustomerFor(tenantA);

    const res = await request(app)
      .post("/api/v1/email-tracking/webhook")
      .send({ event: "complained", email: SHARED_EMAIL, tenantId: String(tenantA) });

    expect(res.status).toBe(200);
    expect(await bouncedFlag(tenantA)).toBe(false);
  });

  test("a batch of events is processed and unparseable entries are skipped", async () => {
    await seedCustomerFor(tenantA);

    const res = await request(app)
      .post("/api/v1/email-tracking/webhook")
      .send([
        { event: "not-a-real-event", email: SHARED_EMAIL },
        {
          event: "bounced",
          bounceType: "hard",
          email: SHARED_EMAIL,
          tenantId: String(tenantA),
        },
      ]);

    expect(res.status).toBe(200);
    expect(await bouncedFlag(tenantA)).toBe(true);
  });
});

describe("email tracking — webhook signature", () => {
  const savedSecret = process.env.EMAIL_WEBHOOK_SECRET;

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
    else process.env.EMAIL_WEBHOOK_SECRET = savedSecret;
  });

  test("rejects a malformed signature with 401 rather than crashing", async () => {
    // A short signature makes timingSafeEqual throw on length mismatch; the
    // handler must treat it as a rejection, not a 500.
    process.env.EMAIL_WEBHOOK_SECRET = "webhook-secret";

    const res = await request(app)
      .post("/api/v1/email-tracking/webhook")
      .set("x-webhook-signature", "short")
      .send({ event: "delivered", email: SHARED_EMAIL });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_signature");
  });

  test("rejects a missing signature when a secret is configured", async () => {
    process.env.EMAIL_WEBHOOK_SECRET = "webhook-secret";

    const res = await request(app)
      .post("/api/v1/email-tracking/webhook")
      .send({ event: "delivered", email: SHARED_EMAIL });

    expect(res.status).toBe(401);
  });
});
