/**
 * @module tests/ttl.worker
 * Tests for the ticket time-to-live sweeper: staged customer reminders
 * followed by an auto-close once the grace window elapses.
 */
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Ticket } from "../../models/Ticket";
import { Tenant } from "../../models/Tenant";
import { bus } from "../../events/emitter";
import { runOnce, startTtlCron, stopTtlCron } from "../../workers/ttl.worker";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const HOUR = 3600000;
let slugCounter = 0;

afterEach(async () => {
  await Ticket.deleteMany({});
  await Tenant.deleteMany({});
  bus.removeAllListeners("ticket");
});

async function makeTenant(overrides: Record<string, any> = {}) {
  return Tenant.create({
    slug: `ttl-${slugCounter++}`,
    branding: { name: "TTL Co" },
    plan: "COMPANY",
    ...overrides,
  });
}

/**
 * Create a ticket with a backdated createdAt/updatedAt. Mongoose marks
 * `createdAt` immutable and silently drops it from model updates, so the
 * timestamps are rewritten through the raw driver instead.
 */
async function makeTicket(
  tenantId: any,
  opts: {
    ageHours: number;
    updatedHoursAgo?: number;
    status?: string;
    remindersSent?: number;
    lastReminderHoursAgo?: number;
    pausedUntil?: Date;
  }
) {
  const ticket = await Ticket.create({
    tenantId,
    subject: "stale ticket",
    body: "waiting on customer",
    status: opts.status ?? "OPEN",
    customerEmail: "customer@example.com",
    createdBy: new Types.ObjectId(),
    ttlRemindersSent: opts.remindersSent ?? 0,
    ttlLastReminderAt:
      opts.lastReminderHoursAgo === undefined
        ? undefined
        : new Date(Date.now() - opts.lastReminderHoursAgo * HOUR),
    ttlPausedUntil: opts.pausedUntil,
  });

  const createdAt = new Date(Date.now() - opts.ageHours * HOUR);
  const updatedAt = new Date(
    Date.now() - (opts.updatedHoursAgo ?? opts.ageHours) * HOUR
  );
  await Ticket.collection.updateOne(
    { _id: ticket._id },
    { $set: { createdAt, updatedAt } }
  );

  return ticket._id;
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

describe("ttl.worker — reminders", () => {
  test("sends the first reminder once the 24h interval has passed", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, { ageHours: 100 });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(1);
    expect(updated!.ttlLastReminderAt).toBeTruthy();
  });

  test("emits a ttl_reminder event carrying the reminder number", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, { ageHours: 100 });

    const events = await captureEvents(() => runOnce());

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "ticket.ttl_reminder",
        ticketId: String(id),
        reminderNumber: 1,
        customerEmail: "customer@example.com",
        tenantId: String(tenant._id),
      })
    );
  });

  test("advances to the 48h interval for the second reminder", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 200,
      remindersSent: 1,
      lastReminderHoursAgo: 50,
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(2);
  });

  test("holds off when the next interval has not yet elapsed", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 200,
      remindersSent: 1,
      lastReminderHoursAgo: 10, // interval[1] is 48h
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(1);
  });

  test("skips tickets an agent touched inside the skip window", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, { ageHours: 100, updatedHoursAgo: 1 });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(0);
  });

  test("honours a tenant's custom reminder intervals", async () => {
    const tenant = await makeTenant({
      ttlConfig: { reminderIntervals: [1], graceWindowHours: 1 },
    });
    const id = await makeTicket(tenant._id, { ageHours: 100 });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(1);
  });
});

describe("ttl.worker — auto-close", () => {
  test("closes the ticket once the grace window expires", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 300,
      remindersSent: 3,
      lastReminderHoursAgo: 25, // grace window is 24h
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.status).toBe("CLOSED");
    expect(updated!.closedBy).toBe("system");
    expect(updated!.closeReason).toBe("ttl_auto_close");
  });

  test("records the transition in statusHistory", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 300,
      status: "AWAITING_CUSTOMER",
      remindersSent: 3,
      lastReminderHoursAgo: 25,
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    const entry = updated!.statusHistory[updated!.statusHistory.length - 1];
    expect(entry.from).toBe("AWAITING_CUSTOMER");
    expect(entry.to).toBe("CLOSED");
    expect(entry.changedBy).toBe("system");
  });

  test("emits a closed event flagged as an auto-close", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 300,
      remindersSent: 3,
      lastReminderHoursAgo: 25,
    });

    const events = await captureEvents(() => runOnce());

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "ticket.closed",
        ticketId: String(id),
        autoClose: true,
      })
    );
  });

  test("waits while the grace window is still open", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 300,
      remindersSent: 3,
      lastReminderHoursAgo: 1,
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.status).toBe("OPEN");
  });
});

describe("ttl.worker — scoping and opt-outs", () => {
  test("does nothing for a tenant with ttl disabled", async () => {
    const tenant = await makeTenant({ ttlConfig: { enabled: false } });
    const id = await makeTicket(tenant._id, { ageHours: 100 });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(0);
  });

  test("ignores tenants that are not active", async () => {
    const tenant = await makeTenant({ isActive: false });
    const id = await makeTicket(tenant._id, { ageHours: 100 });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(0);
  });

  test("ignores statuses outside the applicable set", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, { ageHours: 100, status: "IN_PROGRESS" });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(0);
  });

  test("skips tickets paused into the future", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 100,
      pausedUntil: new Date(Date.now() + 48 * HOUR),
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(0);
  });

  test("processes tickets whose pause has already lapsed", async () => {
    const tenant = await makeTenant();
    const id = await makeTicket(tenant._id, {
      ageHours: 100,
      pausedUntil: new Date(Date.now() - HOUR),
    });

    await runOnce();

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(1);
  });

  test("keeps tenants isolated from one another", async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    const idA = await makeTicket(a._id, { ageHours: 100 });
    const idB = await makeTicket(b._id, { ageHours: 1, updatedHoursAgo: 1 });

    await runOnce();

    expect((await Ticket.findById(idA).lean())!.ttlRemindersSent).toBe(1);
    expect((await Ticket.findById(idB).lean())!.ttlRemindersSent).toBe(0);
  });
});

describe("ttl.worker — tick behaviour", () => {
  test("is a no-op when there are no tenants", async () => {
    await expect(runOnce()).resolves.toBeUndefined();
  });

  test("accepts an injected clock", async () => {
    const tenant = await makeTenant();
    // Only 2h old in real time, but the clock is 100h ahead.
    const id = await makeTicket(tenant._id, { ageHours: 2 });

    await runOnce(new Date(Date.now() + 100 * HOUR));

    const updated = await Ticket.findById(id).lean();
    expect(updated!.ttlRemindersSent).toBe(1);
  });

  test("swallows errors so one bad tick cannot kill the cron", async () => {
    const spy = jest.spyOn(Tenant, "find").mockImplementationOnce(() => {
      throw new Error("mongo is down");
    });

    await expect(runOnce()).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("ttl.worker — cron lifecycle", () => {
  test("start schedules a repeating tick and stop clears it", () => {
    const setSpy = jest.spyOn(global, "setInterval");
    const clearSpy = jest.spyOn(global, "clearInterval");

    startTtlCron(900000);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 900000);

    stopTtlCron();
    expect(clearSpy).toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  test("stopping when not started is safe", () => {
    expect(() => stopTtlCron()).not.toThrow();
  });
});
