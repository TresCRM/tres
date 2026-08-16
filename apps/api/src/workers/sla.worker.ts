import { Ticket } from "../models/Ticket";
import { emitTicketEvent } from "../events/emitter";
import pino from "pino";

const log = pino({ name: "sla-worker" });

const TERMINAL_STATUSES = ["CLOSED", "RESOLVED"];
let timer: ReturnType<typeof setInterval> | null = null;

async function processSlaBreaches() {
  try {
    const now = new Date();

    // First response breaches
    const firstResponseBreaches = await Ticket.find({
      "sla.firstResponseDue": { $lt: now },
      "sla.firstRespondedAt": null,
      "sla.firstResponseBreached": { $ne: true },
      "sla.pausedAt": null, // not paused
      status: { $nin: TERMINAL_STATUSES },
    });

    for (const ticket of firstResponseBreaches) {
      ticket.sla!.firstResponseBreached = true;
      await ticket.save();
      log.warn({ ticketId: String(ticket._id), tenantId: String(ticket.tenantId) }, "SLA first response breach");
      emitTicketEvent(String(ticket.tenantId), {
        event: "ticket.sla_breach",
        ticketId: String(ticket._id),
        type: "first_response",
        tenantId: String(ticket.tenantId),
      });
    }

    // Resolution breaches
    const resolutionBreaches = await Ticket.find({
      "sla.resolutionDue": { $lt: now },
      "sla.resolvedAt": null,
      "sla.resolutionBreached": { $ne: true },
      "sla.pausedAt": null,
      status: { $nin: TERMINAL_STATUSES },
    });

    for (const ticket of resolutionBreaches) {
      ticket.sla!.resolutionBreached = true;
      await ticket.save();
      log.warn({ ticketId: String(ticket._id), tenantId: String(ticket.tenantId) }, "SLA resolution breach");
      emitTicketEvent(String(ticket.tenantId), {
        event: "ticket.sla_breach",
        ticketId: String(ticket._id),
        type: "resolution",
        tenantId: String(ticket.tenantId),
      });
    }

    const total = firstResponseBreaches.length + resolutionBreaches.length;
    if (total > 0) {
      log.info({ firstResponse: firstResponseBreaches.length, resolution: resolutionBreaches.length }, "SLA breaches detected");
    }
  } catch (err) {
    log.error({ err }, "SLA worker tick failed");
  }
}

export function startSlaCron(intervalMs = 300000) {
  log.info({ intervalMs }, "Starting SLA cron");
  processSlaBreaches(); // run immediately
  timer = setInterval(processSlaBreaches, intervalMs);
}

export function stopSlaCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info("SLA cron stopped");
  }
}
