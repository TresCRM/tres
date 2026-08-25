import { Ticket } from "../models/Ticket";
import { Tenant } from "../models/Tenant";
import { emitTicketEvent } from "../events/emitter";
import pino from "pino";

const log = pino({ name: "ttl-worker" });

const DEFAULT_TTL_CONFIG = {
  enabled: true,
  reminderIntervals: [24, 48, 72], // hours
  graceWindowHours: 24,
  applicableStatuses: ["OPEN", "AWAITING_CUSTOMER"],
  skipIfAgentUpdatedWithinHours: 24,
};

let timer: ReturnType<typeof setInterval> | null = null;

async function processTtl(now = new Date()) {
  try {
    const tenants = await Tenant.find({ isActive: true }).lean();

    for (const tenant of tenants) {
      const config = { ...DEFAULT_TTL_CONFIG, ...(tenant as any).ttlConfig };
      if (!config.enabled) continue;

      const tickets = await Ticket.find({
        tenantId: tenant._id,
        status: { $in: config.applicableStatuses },
        ttlPausedUntil: { $not: { $gt: now } },
      });

      for (const ticket of tickets) {
        const remindersSent = ticket.ttlRemindersSent || 0;
        const intervals: number[] = config.reminderIntervals;
        const lastActivity = ticket.updatedAt || ticket.createdAt;

        // Skip if agent recently updated
        const skipCutoff = new Date(now.getTime() - config.skipIfAgentUpdatedWithinHours * 3600000);
        if (lastActivity > skipCutoff) continue;

        if (remindersSent < intervals.length) {
          // Check if it's time for the next reminder
          const intervalHours = intervals[remindersSent];
          const baseTime = ticket.ttlLastReminderAt || ticket.createdAt;
          const nextReminderAt = new Date(baseTime.getTime() + intervalHours * 3600000);

          if (now >= nextReminderAt) {
            ticket.ttlRemindersSent = remindersSent + 1;
            ticket.ttlLastReminderAt = now;
            await ticket.save();

            log.info({ ticketId: String(ticket._id), reminder: remindersSent + 1 }, "Sent TTL reminder");
            emitTicketEvent(String(tenant._id), {
              event: "ticket.ttl_reminder",
              ticketId: String(ticket._id),
              reminderNumber: remindersSent + 1,
              customerEmail: ticket.customerEmail,
              tenantId: String(tenant._id),
            });
          }
        } else {
          // All reminders sent — check grace window
          const graceEnd = new Date(
            (ticket.ttlLastReminderAt || ticket.createdAt).getTime() +
            config.graceWindowHours * 3600000
          );

          if (now >= graceEnd) {
            const fromStatus = ticket.status;
            ticket.status = "CLOSED";
            ticket.closedBy = "system";
            ticket.closeReason = "ttl_auto_close";
            ticket.statusHistory.push({
              from: fromStatus,
              to: "CLOSED",
              changedBy: "system",
              reason: "TTL auto-close after reminders",
              timestamp: now,
            });
            await ticket.save();

            log.info({ ticketId: String(ticket._id) }, "Auto-closed ticket (TTL)");
            emitTicketEvent(String(tenant._id), {
              event: "ticket.closed",
              ticketId: String(ticket._id),
              customerEmail: ticket.customerEmail,
              tenantId: String(tenant._id),
              autoClose: true,
            });
          }
        }
      }
    }
  } catch (err) {
    log.error({ err }, "TTL worker tick failed");
  }
}

export function startTtlCron(intervalMs = 3600000) {
  log.info({ intervalMs }, "Starting TTL cron");
  processTtl(); // run immediately
  timer = setInterval(processTtl, intervalMs);
  timer.unref();
}

export function stopTtlCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info("TTL cron stopped");
  }
}

// Exported for tests and one-shot runs; mirrors billing.worker's runOnce(now).
export { processTtl as runOnce };
