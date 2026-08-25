/**
 * @module tests/anomaly.worker
 * Tests for the anomaly sweeper: per-tenant ticket volume spikes measured
 * against the same UTC hour over the trailing 30 days, plus repeated-sender
 * detection within the last hour.
 */
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Ticket } from "../../models/Ticket";
import { Tenant } from "../../models/Tenant";
import { bus } from "../../events/emitter";
import {
  runOnce,
  startAnomalyCron,
  stopAnomalyCron,
} from "../../workers/anomaly.worker";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const HOUR = 3600000;
const DAY = 86400000;
let slugCounter = 0;

afterEach(async () => {
  await Ticket.deleteMany({});
  await Tenant.deleteMany({});
  bus.removeAllListeners("ticket");
});

async function makeTenant(overrides: Record<string, any> = {}) {
  return Tenant.create({
    slug: `anom-${slugCounter++}`,
    branding: { name: "Anomaly Co" },
    plan: "COMPANY",
    ...overrides,
  });
}

/** Create `count` tickets for a tenant, backdated to `createdAt`. */
async function makeTicketsAt(
  tenantId: any,
  createdAt: Date,
  count: number,
  customerEmail?: string
) {
  for (let i = 0; i < count; i++) {
    const ticket = await Ticket.create({
      tenantId,
      subject: `t${i}`,
      body: "b",
      createdBy: new Types.ObjectId(),
      customerEmail,
    });
    await Ticket.collection.updateOne(
      { _id: ticket._id },
      { $set: { createdAt } }
    );
  }
}

async function captureEvents(fn: () => Promise<any>): Promise<any[]> {
  const events: any[] = [];
  const listener = (payload: any) => events.push(payload);
  bus.on("ticket", listener);
  try {
    await fn();
  } finally {
    bus.off("ticket", listener);
  }
  return events;
}

describe("anomaly.worker — volume spikes", () => {
  test("flags an hour running at more than twice the historical average", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    // Baseline: one ticket in this same UTC hour on each of the last two days.
    await makeTicketsAt(tenant._id, new Date(now.getTime() - DAY), 1);
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 2 * DAY), 1);
    // Current hour: five tickets, well above 2x the average of 1.
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 60000), 5);

    const events = await captureEvents(() => runOnce(now));

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "anomaly.volume_spike",
        tenantId: String(tenant._id),
        currentCount: 5,
        averageCount: 1,
      })
    );
  });

  test("stays quiet when the current hour is in line with history", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(tenant._id, new Date(now.getTime() - DAY), 2);
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 2 * DAY), 2);
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 60000), 2);

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.volume_spike")).toHaveLength(0);
  });

  test("does not flag a spike when there is no history to compare against", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(tenant._id, new Date(now.getTime() - 60000), 20);

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.volume_spike")).toHaveLength(0);
  });

  test("ignores history older than the 30 day window", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(tenant._id, new Date(now.getTime() - 40 * DAY), 50);
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 60000), 3);

    const events = await captureEvents(() => runOnce(now));

    // The stale history is excluded, so the average is 0 and no spike fires.
    expect(events.filter((e) => e.event === "anomaly.volume_spike")).toHaveLength(0);
  });

  test("only compares against the same hour of day", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    // Yesterday at a different hour — must not count toward the baseline.
    await makeTicketsAt(tenant._id, new Date(now.getTime() - DAY - 5 * HOUR), 40);
    await makeTicketsAt(tenant._id, new Date(now.getTime() - 60000), 3);

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.volume_spike")).toHaveLength(0);
  });
});

describe("anomaly.worker — suspicious senders", () => {
  test("flags an address that filed ten or more tickets in the last hour", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 60000),
      10,
      "flood@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "anomaly.suspicious_email",
        tenantId: String(tenant._id),
        email: "flood@example.com",
        count: 10,
      })
    );
  });

  test("leaves a sender below the threshold alone", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 60000),
      9,
      "chatty@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.suspicious_email")).toHaveLength(0);
  });

  test("only counts tickets inside the last hour", async () => {
    const now = new Date();
    const tenant = await makeTenant();

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 3 * HOUR),
      15,
      "old@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.suspicious_email")).toHaveLength(0);
  });

  test("reports each offending sender separately", async () => {
    const now = new Date();
    const tenant = await makeTenant();
    const recent = new Date(now.getTime() - 60000);

    await makeTicketsAt(tenant._id, recent, 10, "a@example.com");
    await makeTicketsAt(tenant._id, recent, 12, "b@example.com");

    const events = await captureEvents(() => runOnce(now));
    const flagged = events
      .filter((e) => e.event === "anomaly.suspicious_email")
      .map((e) => e.email)
      .sort();

    expect(flagged).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("anomaly.worker — scoping and opt-outs", () => {
  test("skips tenants that disabled anomaly detection", async () => {
    const now = new Date();
    const tenant = await makeTenant({ aiFeatures: { anomalyDetection: false } });

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 60000),
      12,
      "flood@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events).toHaveLength(0);
  });

  test("still runs for tenants that left anomaly detection on", async () => {
    const now = new Date();
    const tenant = await makeTenant({ aiFeatures: { anomalyDetection: true } });

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 60000),
      10,
      "flood@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.suspicious_email")).toHaveLength(1);
  });

  test("ignores inactive tenants", async () => {
    const now = new Date();
    const tenant = await makeTenant({ isActive: false });

    await makeTicketsAt(
      tenant._id,
      new Date(now.getTime() - 60000),
      12,
      "flood@example.com"
    );

    const events = await captureEvents(() => runOnce(now));

    expect(events).toHaveLength(0);
  });

  test("does not leak another tenant's tickets into the count", async () => {
    const now = new Date();
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    const recent = new Date(now.getTime() - 60000);

    await makeTicketsAt(a._id, recent, 6, "split@example.com");
    await makeTicketsAt(b._id, recent, 6, "split@example.com");

    const events = await captureEvents(() => runOnce(now));

    expect(events.filter((e) => e.event === "anomaly.suspicious_email")).toHaveLength(0);
  });
});

describe("anomaly.worker — tick behaviour", () => {
  test("is a no-op when there are no tenants", async () => {
    const events = await captureEvents(() => runOnce(new Date()));
    expect(events).toHaveLength(0);
  });

  test("defaults to the current time when no clock is passed", async () => {
    const tenant = await makeTenant();
    await makeTicketsAt(tenant._id, new Date(Date.now() - 60000), 10, "now@example.com");

    const events = await captureEvents(() => runOnce());

    expect(events.filter((e) => e.event === "anomaly.suspicious_email")).toHaveLength(1);
  });

  test("swallows errors so one bad tick cannot kill the cron", async () => {
    const spy = jest.spyOn(Tenant, "find").mockImplementationOnce(() => {
      throw new Error("mongo is down");
    });

    await expect(runOnce(new Date())).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("anomaly.worker — cron lifecycle", () => {
  test("start schedules a repeating tick and stop clears it", () => {
    const setSpy = jest.spyOn(global, "setInterval");
    const clearSpy = jest.spyOn(global, "clearInterval");

    startAnomalyCron(120000);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 120000);

    stopAnomalyCron();
    expect(clearSpy).toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  test("stopping when not started is safe", () => {
    expect(() => stopAnomalyCron()).not.toThrow();
  });
});
