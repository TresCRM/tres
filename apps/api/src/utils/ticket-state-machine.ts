/**
 * Ticket State Machine
 *
 * Formalizes the 8-state ticket lifecycle with validated transitions.
 * Every transition must go through `validateTransition()` before persisting.
 */

export const TICKET_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER",
  "TRANSFERRED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Map of allowed transitions: from -> [to, to, ...]
 */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN:              ["ASSIGNED", "IN_PROGRESS", "CLOSED"],
  ASSIGNED:          ["IN_PROGRESS", "TRANSFERRED", "CLOSED", "AWAITING_CUSTOMER"],
  IN_PROGRESS:       ["AWAITING_CUSTOMER", "RESOLVED", "TRANSFERRED", "CLOSED"],
  AWAITING_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  TRANSFERRED:       ["ASSIGNED", "IN_PROGRESS"],
  RESOLVED:          ["CLOSED", "REOPENED"],
  CLOSED:            ["REOPENED"],
  REOPENED:          ["ASSIGNED", "IN_PROGRESS", "CLOSED"],
};

export interface TransitionResult {
  valid: boolean;
  allowed?: readonly TicketStatus[];
  message?: string;
}

/**
 * Check if a status transition is valid.
 */
export function validateTransition(from: TicketStatus, to: TicketStatus): TransitionResult {
  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, message: `Unknown status: ${from}` };
  }
  if (allowed.includes(to)) {
    return { valid: true };
  }
  return {
    valid: false,
    allowed,
    message: `Cannot transition from ${from} to ${to}. Allowed transitions: ${allowed.join(", ")}`,
  };
}

/**
 * Get allowed next statuses for a given status.
 */
export function getAllowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * Status to assign when a ticket gets an assignee for the first time.
 * Used by assign/reassign routes.
 */
export function statusOnAssign(current: TicketStatus): TicketStatus {
  if (current === "OPEN" || current === "REOPENED" || current === "TRANSFERRED") {
    return "ASSIGNED";
  }
  return current; // don't change status if already in progress, etc.
}

/**
 * Legacy status mapping for migration:
 *   ACTIVE  -> OPEN
 *   CLOSED  -> CLOSED
 *   REOPENED -> REOPENED
 */
export function migrateLegacyStatus(legacy: string): TicketStatus {
  switch (legacy) {
    case "ACTIVE":   return "OPEN";
    case "CLOSED":   return "CLOSED";
    case "REOPENED": return "REOPENED";
    default:         return "OPEN";
  }
}
