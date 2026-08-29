/**
 * @module tests/sla.worker
 * Tests for the SLA breach sweeper.
 * `runOnce(now)` is the worker tick with an injectable clock (see billing.worker).
 */
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Ticket } from "../../models/Ticket";
import { bus } from "../../events/emitter";
import { runOnce, startSlaCron, stopSlaCron } from "../../workers/sla.worker";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const tenantId = new Types.ObjectId();
const HOUR = 3600000;

afterEach(async () => {
  await Ticket.deleteMany({});
  bus.removeAllListeners("ticket");
});

async function makeTicket(sla: Record<string, any>, overrides: Record<string, any> = {}) {
  return Ticket.create({
    tenantId,
    subject: "s",
    body: "b",
    createdBy: new Types.ObjectId(),
    sla,
    ...overrides,
  });
}

/** Collect every ticket event emitted while `fn` runs. */
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

describe("sla.worker — first response breaches", () => {
  test("flags an overdue ticket that has not been responded to", async () => {
    const now = new Date();
    const ticket = await makeTicket({ firstResponseDue: new Date(now.getTime() - HOUR) });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(true);
  });

  test("emits a first_response breach event", async () => {
    const now = new Date();
    const ticket = await makeTicket({ firstResponseDue: new Date(now.getTime() - HOUR) });

    const events = await captureEvents(() => runOnce(now));

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "ticket.sla_breach",
        type: "first_response",
        ticketId: String(ticket._id),
        tenantId: String(tenantId),
      })
    );
  });

  test("leaves a ticket alone while it is still within its due time", async () => {
    const now = new Date();
    const ticket = await makeTicket({ firstResponseDue: new Date(now.getTime() + HOUR) });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(false);
  });

  test("skips tickets that already had a first response", async () => {
    const now = new Date();
    const ticket = await makeTicket({
      firstResponseDue: new Date(now.getTime() - HOUR),
      firstRespondedAt: new Date(now.getTime() - 2 * HOUR),
    });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(false);
  });

  test("does not re-emit for a ticket already marked breached", async () => {
    const now = new Date();
    await makeTicket({
      firstResponseDue: new Date(now.getTime() - HOUR),
      firstResponseBreached: true,
    });

    const events = await captureEvents(() => runOnce(now));

    expect(events).toHaveLength(0);
  });

  test("skips paused tickets", async () => {
    const now = new Date();
    const ticket = await makeTicket({
      firstResponseDue: new Date(now.getTime() - HOUR),
      pausedAt: new Date(now.getTime() - HOUR),
    });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(false);
  });

  test.each(["CLOSED", "RESOLVED"])(
    "skips tickets in terminal status %s",
    async (status) => {
      const now = new Date();
      const ticket = await makeTicket(
        { firstResponseDue: new Date(now.getTime() - HOUR) },
        { status }
      );

      await runOnce(now);

      const updated = await Ticket.findById(ticket._id).lean();
      expect(updated!.sla!.firstResponseBreached).toBe(false);
    }
  );
});

describe("sla.worker — resolution breaches", () => {
  test("flags an overdue unresolved ticket", async () => {
    const now = new Date();
    const ticket = await makeTicket({ resolutionDue: new Date(now.getTime() - HOUR) });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.resolutionBreached).toBe(true);
  });

  test("emits a resolution breach event", async () => {
    const now = new Date();
    const ticket = await makeTicket({ resolutionDue: new Date(now.getTime() - HOUR) });

    const events = await captureEvents(() => runOnce(now));

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "ticket.sla_breach",
        type: "resolution",
        ticketId: String(ticket._id),
      })
    );
  });

  test("skips tickets that were already resolved", async () => {
    const now = new Date();
    const ticket = await makeTicket({
      resolutionDue: new Date(now.getTime() - HOUR),
      resolvedAt: new Date(now.getTime() - HOUR),
    });

    await runOnce(now);

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.resolutionBreached).toBe(false);
  });

  test("a single ticket can breach both clocks in one tick", async () => {
    const now = new Date();
    const ticket = await makeTicket({
      firstResponseDue: new Date(now.getTime() - 2 * HOUR),
      resolutionDue: new Date(now.getTime() - HOUR),
    });

    const events = await captureEvents(() => runOnce(now));

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(true);
    expect(updated!.sla!.resolutionBreached).toBe(true);
    expect(events.map((e) => e.type).sort()).toEqual(["first_response", "resolution"]);
  });
});

describe("sla.worker — tick behaviour", () => {
  test("processes every breaching ticket in one pass", async () => {
    const now = new Date();
    await Promise.all(
      [1, 2, 3].map(() =>
        makeTicket({ firstResponseDue: new Date(now.getTime() - HOUR) })
      )
    );

    await runOnce(now);

    expect(await Ticket.countDocuments({ "sla.firstResponseBreached": true })).toBe(3);
  });

  test("is a no-op when nothing is due", async () => {
    const events = await captureEvents(() => runOnce(new Date()));
    expect(events).toHaveLength(0);
  });

  test("ignores tickets that have no SLA attached", async () => {
    await Ticket.create({
      tenantId,
      subject: "no sla",
      body: "b",
      createdBy: new Types.ObjectId(),
    });

    const events = await captureEvents(() => runOnce(new Date()));
    expect(events).toHaveLength(0);
  });

  test("defaults to the current time when no clock is passed", async () => {
    const ticket = await makeTicket({
      firstResponseDue: new Date(Date.now() - HOUR),
    });

    await runOnce();

    const updated = await Ticket.findById(ticket._id).lean();
    expect(updated!.sla!.firstResponseBreached).toBe(true);
  });

  test("swallows errors so one bad tick cannot kill the cron", async () => {
    const spy = jest.spyOn(Ticket, "find").mockImplementationOnce(() => {
      throw new Error("mongo is down");
    });

    await expect(runOnce(new Date())).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("sla.worker — cron lifecycle", () => {
  test("start schedules a repeating tick and stop clears it", () => {
    const setSpy = jest.spyOn(global, "setInterval");
    const clearSpy = jest.spyOn(global, "clearInterval");

    startSlaCron(600000);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 600000);

    stopSlaCron();
    expect(clearSpy).toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  test("stopping when not started is safe", () => {
    expect(() => stopSlaCron()).not.toThrow();
  });
});
