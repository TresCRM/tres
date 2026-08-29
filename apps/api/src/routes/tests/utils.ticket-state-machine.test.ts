/**
 * @module tests/utils.ticket-state-machine
 * Unit tests for the ticket lifecycle state machine.
 */
import {
  TICKET_STATUSES,
  validateTransition,
  getAllowedTransitions,
  statusOnAssign,
  migrateLegacyStatus,
  type TicketStatus,
} from "../../utils/ticket-state-machine";

describe("validateTransition", () => {
  const legal: [TicketStatus, TicketStatus][] = [
    ["OPEN", "ASSIGNED"],
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "CLOSED"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["ASSIGNED", "TRANSFERRED"],
    ["ASSIGNED", "AWAITING_CUSTOMER"],
    ["IN_PROGRESS", "RESOLVED"],
    ["AWAITING_CUSTOMER", "IN_PROGRESS"],
    ["TRANSFERRED", "ASSIGNED"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "REOPENED"],
    ["CLOSED", "REOPENED"],
    ["REOPENED", "IN_PROGRESS"],
  ];

  test.each(legal)("allows %s -> %s", (from, to) => {
    expect(validateTransition(from, to)).toEqual({ valid: true });
  });

  const illegal: [TicketStatus, TicketStatus][] = [
    ["OPEN", "RESOLVED"],
    ["OPEN", "REOPENED"],
    ["CLOSED", "IN_PROGRESS"],
    ["CLOSED", "OPEN"],
    ["TRANSFERRED", "CLOSED"],
    ["RESOLVED", "IN_PROGRESS"],
  ];

  test.each(illegal)("rejects %s -> %s", (from, to) => {
    expect(validateTransition(from, to).valid).toBe(false);
  });

  test("a rejection reports the allowed targets", () => {
    const result = validateTransition("CLOSED", "IN_PROGRESS");
    expect(result.allowed).toEqual(["REOPENED"]);
    expect(result.message).toContain("Cannot transition from CLOSED to IN_PROGRESS");
    expect(result.message).toContain("REOPENED");
  });

  test("no status may transition to itself", () => {
    for (const status of TICKET_STATUSES) {
      expect(validateTransition(status, status).valid).toBe(false);
    }
  });

  test("an unknown source status is rejected by name", () => {
    const result = validateTransition("BOGUS" as TicketStatus, "OPEN");
    expect(result.valid).toBe(false);
    expect(result.message).toBe("Unknown status: BOGUS");
    expect(result.allowed).toBeUndefined();
  });
});

describe("getAllowedTransitions", () => {
  test("returns the configured targets for a known status", () => {
    expect(getAllowedTransitions("CLOSED")).toEqual(["REOPENED"]);
    expect(getAllowedTransitions("OPEN")).toEqual(["ASSIGNED", "IN_PROGRESS", "CLOSED"]);
  });

  test("every status has at least one way forward", () => {
    for (const status of TICKET_STATUSES) {
      expect(getAllowedTransitions(status).length).toBeGreaterThan(0);
    }
  });

  test("every declared target is itself a known status", () => {
    for (const status of TICKET_STATUSES) {
      for (const target of getAllowedTransitions(status)) {
        expect(TICKET_STATUSES).toContain(target);
      }
    }
  });

  test("agrees with validateTransition", () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        expect(validateTransition(from, to).valid).toBe(
          getAllowedTransitions(from).includes(to)
        );
      }
    }
  });

  test("returns an empty list for an unknown status", () => {
    expect(getAllowedTransitions("BOGUS" as TicketStatus)).toEqual([]);
  });
});

describe("statusOnAssign", () => {
  test.each(["OPEN", "REOPENED", "TRANSFERRED"] as TicketStatus[])(
    "moves %s to ASSIGNED",
    (status) => {
      expect(statusOnAssign(status)).toBe("ASSIGNED");
    }
  );

  test.each([
    "ASSIGNED",
    "IN_PROGRESS",
    "AWAITING_CUSTOMER",
    "RESOLVED",
    "CLOSED",
  ] as TicketStatus[])("leaves %s unchanged", (status) => {
    expect(statusOnAssign(status)).toBe(status);
  });
});

describe("migrateLegacyStatus", () => {
  test.each([
    ["ACTIVE", "OPEN"],
    ["CLOSED", "CLOSED"],
    ["REOPENED", "REOPENED"],
  ])("maps legacy %s to %s", (legacy, expected) => {
    expect(migrateLegacyStatus(legacy)).toBe(expected);
  });

  test.each(["", "UNKNOWN", "active", "PENDING"])(
    "defaults unrecognised value %p to OPEN",
    (legacy) => {
      expect(migrateLegacyStatus(legacy)).toBe("OPEN");
    }
  );
});
