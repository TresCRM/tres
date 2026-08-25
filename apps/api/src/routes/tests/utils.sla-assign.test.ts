/**
 * @module tests/utils.sla-assign
 * Tests for auto-assigning an SLA policy to a newly created ticket.
 * Covers the exact-priority -> ALL -> default resolution order and the
 * due-date arithmetic derived from the matched policy.
 */
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Ticket } from "../../models/Ticket";
import { SlaPolicy } from "../../models/SlaPolicy";
import { assignSlaToTicket } from "../../utils/sla-assign";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const tenantId = new Types.ObjectId();

afterEach(async () => {
  await SlaPolicy.deleteMany({});
  await Ticket.deleteMany({});
});

async function makeTicket(priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "HIGH") {
  return Ticket.create({
    tenantId,
    subject: "printer on fire",
    body: "again",
    priority,
    createdBy: new Types.ObjectId(),
  });
}

async function makePolicy(overrides: Partial<any> = {}) {
  return SlaPolicy.create({
    tenantId,
    name: "policy",
    priority: "ALL",
    firstResponseMinutes: 30,
    resolutionMinutes: 240,
    ...overrides,
  });
}

describe("assignSlaToTicket — policy selection", () => {
  test("prefers a policy whose priority matches the ticket exactly", async () => {
    await makePolicy({ name: "all", priority: "ALL" });
    const exact = await makePolicy({ name: "high", priority: "HIGH" });

    const ticket = await makeTicket("HIGH");
    await assignSlaToTicket(ticket, tenantId);

    expect(String(ticket.sla!.policyId)).toBe(String(exact._id));
  });

  test("falls back to an ALL policy when no exact match exists", async () => {
    const all = await makePolicy({ name: "all", priority: "ALL" });
    await makePolicy({ name: "low", priority: "LOW" });

    const ticket = await makeTicket("CRITICAL");
    await assignSlaToTicket(ticket, tenantId);

    expect(String(ticket.sla!.policyId)).toBe(String(all._id));
  });

  test("falls back to the default policy when neither exact nor ALL matches", async () => {
    const fallback = await makePolicy({
      name: "default",
      priority: "LOW",
      isDefault: true,
    });

    const ticket = await makeTicket("CRITICAL");
    await assignSlaToTicket(ticket, tenantId);

    expect(String(ticket.sla!.policyId)).toBe(String(fallback._id));
  });

  test("ignores inactive policies", async () => {
    await makePolicy({ name: "inactive", priority: "HIGH", isActive: false });

    const ticket = await makeTicket("HIGH");
    await assignSlaToTicket(ticket, tenantId);

    expect(ticket.sla).toBeUndefined();
  });

  test("ignores policies belonging to another tenant", async () => {
    await makePolicy({ name: "other", priority: "ALL", tenantId: new Types.ObjectId() });

    const ticket = await makeTicket("HIGH");
    await assignSlaToTicket(ticket, tenantId);

    expect(ticket.sla).toBeUndefined();
  });

  test("is a no-op when the tenant has no policies at all", async () => {
    const ticket = await makeTicket("HIGH");
    await assignSlaToTicket(ticket, tenantId);

    expect(ticket.sla).toBeUndefined();
  });

  test("leaves sla unset when policies exist but none are selectable", async () => {
    // A non-default policy for a different priority, and no ALL policy.
    await makePolicy({ name: "low-only", priority: "LOW", isDefault: false });

    const ticket = await makeTicket("CRITICAL");
    await assignSlaToTicket(ticket, tenantId);

    expect(ticket.sla).toBeUndefined();
  });

  test("accepts the tenant id as a string", async () => {
    const policy = await makePolicy({ priority: "ALL" });

    const ticket = await makeTicket("MEDIUM");
    await assignSlaToTicket(ticket, String(tenantId));

    expect(String(ticket.sla!.policyId)).toBe(String(policy._id));
  });
});

describe("assignSlaToTicket — due dates and initial state", () => {
  test("derives due dates from the policy's minute budgets", async () => {
    await makePolicy({
      priority: "ALL",
      firstResponseMinutes: 15,
      resolutionMinutes: 120,
    });

    const before = Date.now();
    const ticket = await makeTicket("LOW");
    await assignSlaToTicket(ticket, tenantId);
    const after = Date.now();

    const firstResponseDue = ticket.sla!.firstResponseDue!.getTime();
    const resolutionDue = ticket.sla!.resolutionDue!.getTime();

    expect(firstResponseDue).toBeGreaterThanOrEqual(before + 15 * 60000);
    expect(firstResponseDue).toBeLessThanOrEqual(after + 15 * 60000);
    expect(resolutionDue).toBeGreaterThanOrEqual(before + 120 * 60000);
    expect(resolutionDue).toBeLessThanOrEqual(after + 120 * 60000);
  });

  test("initialises the tracking fields to an unbreached, unpaused state", async () => {
    await makePolicy({ priority: "ALL" });

    const ticket = await makeTicket("LOW");
    await assignSlaToTicket(ticket, tenantId);

    expect(ticket.sla!.firstRespondedAt).toBeUndefined();
    expect(ticket.sla!.resolvedAt).toBeUndefined();
    expect(ticket.sla!.firstResponseBreached).toBe(false);
    expect(ticket.sla!.resolutionBreached).toBe(false);
    expect(ticket.sla!.pausedAt).toBeUndefined();
    expect(ticket.sla!.totalPausedMs).toBe(0);
  });

  test("mutates in place only — the caller is responsible for saving", async () => {
    await makePolicy({ priority: "ALL" });

    const ticket = await makeTicket("LOW");
    await assignSlaToTicket(ticket, tenantId);

    const reloadedBeforeSave = await Ticket.findById(ticket._id).lean();
    expect(reloadedBeforeSave!.sla).toBeUndefined();

    await ticket.save();
    const reloadedAfterSave = await Ticket.findById(ticket._id).lean();
    expect(reloadedAfterSave!.sla).toBeTruthy();
  });
});
