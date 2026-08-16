import { SlaPolicy } from "../models/SlaPolicy";
import type { TicketDoc } from "../models/Ticket";
import type { Types } from "mongoose";

/**
 * Auto-assign an SLA policy to a newly created ticket.
 * Finds the best matching active policy for the tenant + priority.
 * Mutates ticket.sla in place (caller must save).
 */
export async function assignSlaToTicket(
  ticket: TicketDoc,
  tenantId: Types.ObjectId | string
): Promise<void> {
  // Find matching policies: exact priority match first, then "ALL" fallback
  const policies = await SlaPolicy.find({
    tenantId,
    isActive: true,
  })
    .sort({ isDefault: -1 })
    .lean();

  if (policies.length === 0) return;

  // Prefer exact priority match, then ALL, then default
  const exactMatch = policies.find(
    (p) => p.priority === ticket.priority
  );
  const allMatch = policies.find((p) => p.priority === "ALL");
  const defaultMatch = policies.find((p) => p.isDefault);

  const policy = exactMatch || allMatch || defaultMatch;
  if (!policy) return;

  const now = new Date();
  ticket.sla = {
    policyId: policy._id,
    firstResponseDue: new Date(now.getTime() + policy.firstResponseMinutes * 60000),
    resolutionDue: new Date(now.getTime() + policy.resolutionMinutes * 60000),
    firstRespondedAt: undefined,
    resolvedAt: undefined,
    firstResponseBreached: false,
    resolutionBreached: false,
    pausedAt: undefined,
    totalPausedMs: 0,
  };
}
