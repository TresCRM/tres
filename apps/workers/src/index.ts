import "dotenv/config";
import { processSubscriptionsNow } from "./jobs/billing";
import { connect as Connected } from "mongoose";
import { connect, JSONCodec } from "nats";
const jc = JSONCodec<any>();
import { mailer } from "../../../apps/api/src/services/mailer";
import { Tenant } from "../../../apps/api/src/models/Tenant";
import { Ticket } from "../../../apps/api/src/models/Ticket";
import { User } from "../../../apps/api/src/models/User";


(async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  await Connected(uri, { autoIndex: true });
  console.log("[worker] mongoose connected");
  // run immediately, then hourly
  await processSubscriptionsNow();
  setInterval(() => processSubscriptionsNow().catch(console.error), 60 * 60 * 1000);
  // continue nats
   // NATS subscription
  try {
    const url = process.env.EVENTS_URL || "nats://localhost:4222";
    const nc = await connect({ servers: url });
    const jc = JSONCodec<any>();

    const sub = nc.subscribe("ticket.events");
    (async () => {
      for await (const m of sub) {
        const evt = jc.decode(m.data); // { tenantId, event, ticketId, ... }
        if (
          evt.event === "ticket.created" || 
          evt.event === "ticket.replied" || 
          evt.event === "ticket.closed" ||
          evt.event === "ticket.assigned" ||
          evt.event === "ticket.reopened"
        ) {
          await sendTicketEmail(evt.tenantId, evt.ticketId, evt.event);
        }
      }
    })();
  } catch (e) {
    console.warn("[worker] NATS not connected; ticket emails disabled in this session.");
  }
})();

async function sendTicketEmail(tenantId: string, ticketId: string, event: string) {
  const tenant = await Tenant.findById(tenantId).lean();
  const ticket = await Ticket.findById(ticketId).lean();
  if (!tenant || !ticket) return;

  const from = tenant.branding?.emailFrom ?? "no-reply@trescrm.local";
  const subject = `[${event}] #${ticketId} ${ticket.subject}`;
  const html = `<p>Ticket event: ${event}</p><p>${ticket.body}</p>`;

  // naive target list: watchers + customerEmail + assigned agent (MVP)
  const targets = new Set<string>();
  ticket.customerEmail && targets.add(ticket.customerEmail);
  ticket.watchers?.forEach((w) => targets.add(w));
  if (ticket.assigneeId) {
    const assignee = await User.findById(ticket.assigneeId).lean();
    assignee?.email && targets.add(assignee.email);
  }
  if (targets.size === 0) return;

  await mailer.sendMail({ from, to: Array.from(targets).join(","), subject, html });
}
