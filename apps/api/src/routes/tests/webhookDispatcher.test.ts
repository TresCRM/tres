/**
 * @module tests/webhookDispatcher
 * Tests for outbound webhook delivery: subscriber selection, HMAC-SHA256
 * signing, failure accounting and auto-disable after repeated failures.
 *
 * `fetch` is stubbed so no network traffic leaves the test process.
 */
import { createHmac } from "crypto";
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Webhook } from "../../models/Webhook";
import { DomainEvent } from "../../models/DomainEvent";
import { dispatchWebhooks, sendTestWebhook } from "../../services/webhookDispatcher";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const tenantId = new Types.ObjectId();
const SECRET = "whsec_test";

let fetchMock: jest.Mock;
const realFetch = global.fetch;

beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as any);
  (global as any).fetch = fetchMock;
});

afterEach(async () => {
  (global as any).fetch = realFetch;
  await Webhook.deleteMany({});
  await DomainEvent.deleteMany({});
  jest.clearAllMocks();
});

async function makeWebhook(overrides: Record<string, any> = {}) {
  return Webhook.create({
    tenantId,
    url: "https://hooks.example.com/incoming",
    secret: SECRET,
    events: ["ticket.created"],
    createdBy: new Types.ObjectId(),
    ...overrides,
  });
}

/**
 * Deliveries are fired without being awaited. `fetch` itself is invoked
 * synchronously inside the dispatch loop, so a microtask flush is enough
 * before asserting on the outgoing request.
 */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

/**
 * The bookkeeping that follows a delivery is a real database round-trip, so
 * poll for it rather than assuming it lands within a fixed number of ticks.
 */
async function waitForWebhook(
  id: any,
  predicate: (wh: any) => boolean,
  timeoutMs = 10000
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let last: any;
  while (Date.now() < deadline) {
    last = await Webhook.findById(id).lean();
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(
    `timed out waiting for webhook ${id}; last seen: ${JSON.stringify(last)}`
  );
}

describe("dispatchWebhooks — subscriber selection", () => {
  test("delivers to a webhook subscribed to the event", async () => {
    await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", { id: "t1" });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.example.com/incoming");
  });

  test("ignores webhooks not subscribed to the event", async () => {
    await makeWebhook({ events: ["ticket.closed"] });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("ignores inactive webhooks", async () => {
    await makeWebhook({ isActive: false });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("ignores webhooks belonging to another tenant", async () => {
    await makeWebhook({ tenantId: new Types.ObjectId() });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fans out to every matching subscriber", async () => {
    await makeWebhook({ url: "https://a.example.com" });
    await makeWebhook({ url: "https://b.example.com" });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("records nothing when there are no subscribers", async () => {
    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await DomainEvent.countDocuments({})).toBe(0);
  });
});

describe("dispatchWebhooks — payload and signature", () => {
  test("posts a JSON envelope describing the event", async () => {
    await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", { id: "t1" });
    await settle();

    const init = fetchMock.mock.calls[0][1];
    const payload = JSON.parse(init.body);
    expect(init.method).toBe("POST");
    expect(payload).toMatchObject({
      event: "ticket.created",
      tenantId: String(tenantId),
      data: { id: "t1" },
    });
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
  });

  test("signs the exact body with HMAC-SHA256 over the webhook secret", async () => {
    await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", { id: "t1" });
    await settle();

    const init = fetchMock.mock.calls[0][1];
    const expected = createHmac("sha256", SECRET).update(init.body).digest("hex");
    expect(init.headers["X-Webhook-Signature"]).toBe(expected);
  });

  test("sends the standard content-type, timestamp and user-agent headers", async () => {
    await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("TresCRM-Webhook/1.0");
    expect(Date.parse(headers["X-Webhook-Timestamp"])).not.toBeNaN();
  });

  test("signs per webhook, so each subscriber gets its own signature", async () => {
    await makeWebhook({ url: "https://a.example.com", secret: "secret-a" });
    await makeWebhook({ url: "https://b.example.com", secret: "secret-b" });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});
    await settle();

    const [first, second] = fetchMock.mock.calls;
    expect(first[1].headers["X-Webhook-Signature"]).not.toBe(
      second[1].headers["X-Webhook-Signature"]
    );
  });

  test("stores a domain event for the dispatch", async () => {
    await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", { id: "t1" });

    const stored = await DomainEvent.findOne({ type: "ticket.created" }).lean();
    expect(stored).toBeTruthy();
    expect((stored as any).payload.data).toEqual({ id: "t1" });
  });
});

describe("dispatchWebhooks — failure handling", () => {
  test("clears the failure counter on a successful delivery", async () => {
    const wh = await makeWebhook({ failCount: 4 });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    const updated = await waitForWebhook(wh._id, (w) => !!w.lastTriggeredAt);
    expect(updated.failCount).toBe(0);
  });

  test("counts a non-2xx response as a failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as any);
    const wh = await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    const updated = await waitForWebhook(wh._id, (w) => w.failCount === 1);
    expect(updated.lastFailedAt).toBeTruthy();
  });

  test("counts a transport error as a failure", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const wh = await makeWebhook();

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    await waitForWebhook(wh._id, (w) => w.failCount === 1);
  });

  test("increments an existing failure count", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as any);
    const wh = await makeWebhook({ failCount: 3 });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    await waitForWebhook(wh._id, (w) => w.failCount === 4);
  });

  test("auto-disables the webhook on the tenth consecutive failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as any);
    const wh = await makeWebhook({ failCount: 9 });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    const updated = await waitForWebhook(wh._id, (w) => w.failCount === 10);
    expect(updated.isActive).toBe(false);
  });

  test("stays enabled while below the failure ceiling", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as any);
    const wh = await makeWebhook({ failCount: 8 });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    const updated = await waitForWebhook(wh._id, (w) => w.failCount === 9);
    expect(updated.isActive).toBe(true);
  });

  test("never throws to the caller, even on a malformed tenant id", async () => {
    await expect(
      dispatchWebhooks("not-an-object-id", "ticket.created", {})
    ).resolves.toBeUndefined();
  });

  test("one failing subscriber does not stop the others", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://a.example.com") throw new Error("down");
      return { ok: true, status: 200 } as any;
    });
    const a = await makeWebhook({ url: "https://a.example.com" });
    const b = await makeWebhook({ url: "https://b.example.com" });

    await dispatchWebhooks(String(tenantId), "ticket.created", {});

    await waitForWebhook(a._id, (w) => w.failCount === 1);
    const ok = await waitForWebhook(b._id, (w) => !!w.lastTriggeredAt);
    expect(ok.failCount).toBe(0);
  });
});

describe("sendTestWebhook", () => {
  test("posts a test.ping envelope and reports success", async () => {
    const wh = await makeWebhook();

    const result = await sendTestWebhook(String(wh._id), String(tenantId));

    expect(result).toEqual({ success: true, statusCode: 200 });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.event).toBe("test.ping");
    expect(payload.tenantId).toBe(String(tenantId));
  });

  test("signs the test payload with the webhook secret", async () => {
    const wh = await makeWebhook();

    await sendTestWebhook(String(wh._id), String(tenantId));

    const init = fetchMock.mock.calls[0][1];
    const expected = createHmac("sha256", SECRET).update(init.body).digest("hex");
    expect(init.headers["X-Webhook-Signature"]).toBe(expected);
  });

  test("reports the status code when the endpoint rejects the ping", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as any);
    const wh = await makeWebhook();

    expect(await sendTestWebhook(String(wh._id), String(tenantId))).toEqual({
      success: false,
      statusCode: 404,
    });
  });

  test("reports the transport error message", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const wh = await makeWebhook();

    expect(await sendTestWebhook(String(wh._id), String(tenantId))).toEqual({
      success: false,
      error: "ECONNREFUSED",
    });
  });

  test("falls back to a generic message when the error has none", async () => {
    fetchMock.mockRejectedValue(new Error(""));
    const wh = await makeWebhook();

    expect(await sendTestWebhook(String(wh._id), String(tenantId))).toEqual({
      success: false,
      error: "Connection failed",
    });
  });

  test("reports not-found for an unknown webhook", async () => {
    expect(
      await sendTestWebhook(String(new Types.ObjectId()), String(tenantId))
    ).toEqual({ success: false, error: "Webhook not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("will not ping another tenant's webhook", async () => {
    const wh = await makeWebhook({ tenantId: new Types.ObjectId() });

    expect(await sendTestWebhook(String(wh._id), String(tenantId))).toEqual({
      success: false,
      error: "Webhook not found",
    });
  });

  test("pings inactive webhooks too, so they can be re-verified", async () => {
    const wh = await makeWebhook({ isActive: false });

    expect(await sendTestWebhook(String(wh._id), String(tenantId))).toEqual({
      success: true,
      statusCode: 200,
    });
  });
});
