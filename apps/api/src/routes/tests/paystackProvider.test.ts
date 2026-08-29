/**
 * @module tests/paystackProvider
 * Tests for the Paystack payment provider wrapper.
 *
 * The secret key is set inside the test rather than read from the ambient
 * environment, so these paths are exercised identically on a developer machine
 * and in CI. `fetch` is stubbed — no request reaches Paystack.
 */
import crypto from "crypto";

type ProviderModule = typeof import("../../billing/paystackProvider");

const SECRET = "sk_test_deadbeefcafe";
const realFetch = global.fetch;
const savedKey = process.env.PAYSTACK_SECRET_KEY;

let fetchMock: jest.Mock;

/** Load a fresh copy of the module (the factory memoises its provider). */
function loadWithKey(key: string | undefined): ProviderModule {
  if (key === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = key;

  let mod!: ProviderModule;
  jest.isolateModules(() => {
    mod = require("../../billing/paystackProvider");
  });
  return mod;
}

function paystackResponse(data: any, { status = true, message = "" } = {}) {
  return {
    status: 200,
    json: async () => ({ status, message, data }),
  } as any;
}

beforeEach(() => {
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});

afterEach(() => {
  (global as any).fetch = realFetch;
  jest.clearAllMocks();
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = savedKey;
});

const checkoutParams = {
  planCode: "TEAM" as const,
  interval: "MONTH" as const,
  tenantId: "tenant-1",
  tenantSlug: "acme",
  email: "billing@acme.test",
  callbackUrl: "https://app.example.com/billing/callback",
};

/** Parsed request body of the most recent stubbed fetch call. */
function lastBody(): any {
  return JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
}

describe("getPaymentProvider — configuration", () => {
  test("returns null when no secret key is set", () => {
    expect(loadWithKey(undefined).getPaymentProvider()).toBeNull();
  });

  test("returns null for a key that is not a Paystack secret key", () => {
    expect(loadWithKey("pk_test_public").getPaymentProvider()).toBeNull();
  });

  test("returns null for an empty key", () => {
    expect(loadWithKey("").getPaymentProvider()).toBeNull();
  });

  test.each(["sk_test_abc", "sk_live_abc"])("accepts %s", (key) => {
    expect(loadWithKey(key).getPaymentProvider()).not.toBeNull();
  });

  test("memoises the provider across calls", () => {
    const mod = loadWithKey(SECRET);
    expect(mod.getPaymentProvider()).toBe(mod.getPaymentProvider());
  });

  test("memoises the null result too", () => {
    const mod = loadWithKey(undefined);
    expect(mod.getPaymentProvider()).toBeNull();
    expect(mod.getPaymentProvider()).toBeNull();
  });
});

describe("initializeTransaction", () => {
  let provider: NonNullable<ReturnType<ProviderModule["getPaymentProvider"]>>;

  beforeEach(() => {
    provider = loadWithKey(SECRET).getPaymentProvider()!;
  });

  test("posts to the initialize endpoint with the secret key", async () => {
    fetchMock.mockResolvedValue(
      paystackResponse({
        reference: "ref_1",
        authorization_url: "https://checkout.paystack.com/abc",
        access_code: "ac_1",
      })
    );

    await provider.initializeTransaction(checkoutParams);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  test("returns the reference, authorization url and access code", async () => {
    fetchMock.mockResolvedValue(
      paystackResponse({
        reference: "ref_1",
        authorization_url: "https://checkout.paystack.com/abc",
        access_code: "ac_1",
      })
    );

    expect(await provider.initializeTransaction(checkoutParams)).toEqual({
      reference: "ref_1",
      authorizationUrl: "https://checkout.paystack.com/abc",
      accessCode: "ac_1",
    });
  });

  test("sends the customer email, currency and callback url", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.initializeTransaction(checkoutParams);

    const body = lastBody();
    expect(body.email).toBe("billing@acme.test");
    expect(body.currency).toBe("NGN");
    expect(body.callback_url).toBe(checkoutParams.callbackUrl);
    expect(body.channels).toEqual(["card", "bank", "ussd", "bank_transfer"]);
  });

  test("carries tenant and plan identifiers in metadata", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.initializeTransaction(checkoutParams);

    expect(lastBody().metadata).toMatchObject({
      tenantId: "tenant-1",
      tenantSlug: "acme",
      planCode: "TEAM",
      interval: "MONTH",
    });
  });

  test("prices the transaction from the plan and interval", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));
    const { getPlanByCode, priceForInterval } = require("../../billing/plans");
    const expected = priceForInterval(getPlanByCode("TEAM"), "MONTH");

    await provider.initializeTransaction(checkoutParams);

    expect(lastBody().amount).toBe(expected);
  });

  test("applies the annual discount", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.initializeTransaction({ ...checkoutParams, interval: "ANNUAL" });
    const annual = lastBody().amount;

    await provider.initializeTransaction(checkoutParams);
    const monthly = lastBody().amount;

    expect(annual).toBeLessThan(monthly * 12);
  });

  test("attaches an existing customer code when supplied", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.initializeTransaction({
      ...checkoutParams,
      paystackCustomerCode: "CUS_123",
    });

    expect(lastBody().customer).toBe("CUS_123");
  });

  test("omits the customer field for a first-time payer", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.initializeTransaction(checkoutParams);

    expect(lastBody().customer).toBeUndefined();
  });

  test("rejects an unknown plan code", async () => {
    await expect(
      provider.initializeTransaction({ ...checkoutParams, planCode: "NOPE" as any })
    ).rejects.toThrow("Unknown or inactive plan: NOPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects self-serve checkout for custom plans", async () => {
    await expect(
      provider.initializeTransaction({ ...checkoutParams, planCode: "ENTERPRISE" as any })
    ).rejects.toThrow("Custom plans cannot be purchased via self-serve checkout");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("surfaces the Paystack error message on a failed call", async () => {
    fetchMock.mockResolvedValue(
      paystackResponse(null, { status: false, message: "Invalid key" })
    );

    await expect(provider.initializeTransaction(checkoutParams)).rejects.toThrow(
      "Invalid key"
    );
  });

  test("falls back to a generic message when Paystack sends none", async () => {
    fetchMock.mockResolvedValue({
      status: 502,
      json: async () => ({ status: false }),
    } as any);

    await expect(provider.initializeTransaction(checkoutParams)).rejects.toThrow(
      "Paystack API error: 502"
    );
  });
});

describe("verifyTransaction", () => {
  let provider: NonNullable<ReturnType<ProviderModule["getPaymentProvider"]>>;

  beforeEach(() => {
    provider = loadWithKey(SECRET).getPaymentProvider()!;
  });

  test("GETs the verify endpoint and returns the data payload", async () => {
    fetchMock.mockResolvedValue(paystackResponse({ status: "success", amount: 1000 }));

    const data = await provider.verifyTransaction("ref_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/transaction/verify/ref_1");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(data).toEqual({ status: "success", amount: 1000 });
  });

  test("url-encodes the reference", async () => {
    fetchMock.mockResolvedValue(paystackResponse({}));

    await provider.verifyTransaction("ref/with space");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.paystack.co/transaction/verify/ref%2Fwith%20space"
    );
  });

  test("throws when Paystack reports failure", async () => {
    fetchMock.mockResolvedValue(
      paystackResponse(null, { status: false, message: "Transaction not found" })
    );

    await expect(provider.verifyTransaction("ref_1")).rejects.toThrow(
      "Transaction not found"
    );
  });
});

describe("verifyWebhook", () => {
  let provider: NonNullable<ReturnType<ProviderModule["getPaymentProvider"]>>;

  beforeEach(() => {
    provider = loadWithKey(SECRET).getPaymentProvider()!;
  });

  function sign(payload: string) {
    return crypto.createHmac("sha512", SECRET).update(payload).digest("hex");
  }

  test("accepts a correctly signed string payload", () => {
    const payload = JSON.stringify({ event: "charge.success", data: { id: 1 } });

    expect(provider.verifyWebhook(payload, sign(payload))).toEqual({
      event: "charge.success",
      data: { id: 1 },
    });
  });

  test("accepts a correctly signed Buffer payload", () => {
    const payload = JSON.stringify({ event: "charge.success", data: { id: 2 } });

    expect(provider.verifyWebhook(Buffer.from(payload, "utf-8"), sign(payload))).toEqual({
      event: "charge.success",
      data: { id: 2 },
    });
  });

  test("rejects a payload signed with the wrong key", () => {
    const payload = JSON.stringify({ event: "charge.success", data: {} });
    const wrong = crypto.createHmac("sha512", "sk_test_other").update(payload).digest("hex");

    expect(() => provider.verifyWebhook(payload, wrong)).toThrow(
      "Invalid Paystack webhook signature"
    );
  });

  test("rejects a tampered payload", () => {
    const original = JSON.stringify({ event: "charge.success", data: { amount: 100 } });
    const signature = sign(original);
    const tampered = JSON.stringify({ event: "charge.success", data: { amount: 999999 } });

    expect(() => provider.verifyWebhook(tampered, signature)).toThrow(
      "Invalid Paystack webhook signature"
    );
  });

  test("rejects a missing signature", () => {
    const payload = JSON.stringify({ event: "charge.success", data: {} });

    expect(() => provider.verifyWebhook(payload, "")).toThrow(
      "Invalid Paystack webhook signature"
    );
  });
});

describe("syncSubscriptionStatus", () => {
  let provider: NonNullable<ReturnType<ProviderModule["getPaymentProvider"]>>;

  beforeEach(() => {
    provider = loadWithKey(SECRET).getPaymentProvider()!;
  });

  test.each([
    ["active", "ACTIVE"],
    ["non-renewing", "ACTIVE"],
    ["attention", "PAST_DUE"],
    ["completed", "EXPIRED"],
    ["cancelled", "CANCELED"],
  ])("maps Paystack status %s to %s", (paystack, internal) => {
    expect(provider.syncSubscriptionStatus({ status: paystack }).status).toBe(internal);
  });

  test("treats an unrecognised status as EXPIRED", () => {
    expect(provider.syncSubscriptionStatus({ status: "who-knows" }).status).toBe("EXPIRED");
  });

  test("treats a missing status as EXPIRED", () => {
    expect(provider.syncSubscriptionStatus({}).status).toBe("EXPIRED");
  });

  test("carries the billing period across", () => {
    const result = provider.syncSubscriptionStatus({
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      next_payment_date: "2026-02-01T00:00:00.000Z",
    });

    expect(result.currentPeriodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("defaults the period to now when Paystack omits the dates", () => {
    const before = Date.now();
    const result = provider.syncSubscriptionStatus({ status: "active" });

    expect(result.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.currentPeriodEnd.getTime()).toBeGreaterThanOrEqual(before);
  });

  test("marks an active subscription as auto-renewing and not canceled", () => {
    const result = provider.syncSubscriptionStatus({ status: "active" });

    expect(result.autoRenew).toBe(true);
    expect(result.canceledAt).toBeNull();
  });

  test.each(["cancelled", "non-renewing"])(
    "stamps canceledAt and clears autoRenew for %s",
    (status) => {
      const result = provider.syncSubscriptionStatus({ status });

      expect(result.canceledAt).toBeInstanceOf(Date);
      expect(result.autoRenew).toBe(false);
    }
  );

  test("leaves canceledAt unset for a past-due subscription", () => {
    const result = provider.syncSubscriptionStatus({ status: "attention" });

    expect(result.canceledAt).toBeNull();
    expect(result.autoRenew).toBe(false);
  });
});
