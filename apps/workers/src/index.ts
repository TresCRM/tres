import "dotenv/config";
import http from "http";
import { processSubscriptionsNow } from "./jobs/billing";
import mongoose, { connect as Connected } from "mongoose";
import { connect, JSONCodec, type NatsConnection, type Subscription } from "nats";
import { mailer } from "../../../apps/api/src/services/mailer";
import { Tenant } from "../../../apps/api/src/models/Tenant";
import { Ticket } from "../../../apps/api/src/models/Ticket";
import { User } from "../../../apps/api/src/models/User";
import { withLock } from "../../../apps/api/src/utils/distributedLock";

const jc = JSONCodec<any>();

const BILLING_INTERVAL_MS = 60 * 60 * 1000;
/** Longer than a sweep can plausibly take, shorter than the interval. */
const BILLING_LOCK_TTL_MS = 30 * 60 * 1000;
const SHUTDOWN_GRACE_MS = 15_000;

let billingTimer: ReturnType<typeof setInterval> | null = null;
let natsConnection: NatsConnection | null = null;
let natsSubscription: Subscription | null = null;
let ready = false;
let shuttingDown = false;
let healthServer: http.Server | null = null;

/**
 * Run the billing sweep, but only on whichever replica wins the lock.
 *
 * Every replica runs this timer. Without the lock, three replicas send three
 * renewal reminders and write three expiry transitions for the same
 * subscription.
 */
async function runBillingSweep() {
  if (shuttingDown) return;
  try {
    const { ran } = await withLock("workers:billing", BILLING_LOCK_TTL_MS, () =>
      processSubscriptionsNow()
    );
    if (!ran) console.log("[worker] billing sweep already running elsewhere — skipped");
  } catch (err) {
    console.error("[worker] billing sweep failed", err);
  }
}

/**
 * Health endpoint.
 *
 * The container healthcheck and Kubernetes probes need something real to ask.
 * Without it the workers deployment has no way to notice a hung process, and a
 * healthcheck that cannot fail is worse than none — it reports green while the
 * process is wedged.
 *
 * /healthz is liveness: the event loop is still turning.
 * /readyz is readiness: dependencies are actually usable.
 */
function startHealthServer(port: number) {
  healthServer = http.createServer((req, res) => {
    const send = (code: number, body: Record<string, unknown>) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.url === "/healthz") {
      return send(shuttingDown ? 503 : 200, { ok: !shuttingDown, uptime: process.uptime() });
    }
    if (req.url === "/readyz") {
      const mongoUp = mongoose.connection.readyState === 1;
      const isReady = ready && mongoUp && !shuttingDown;
      return send(isReady ? 200 : 503, {
        ready: isReady,
        mongo: mongoUp ? "connected" : "disconnected",
        nats: natsConnection ? "connected" : "disconnected",
      });
    }
    send(404, { error: "not_found" });
  });

  healthServer.listen(port, () => console.log(`[worker] health server on :${port}`));
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received — draining`);

  // Fail readiness first so the load balancer stops sending work our way while
  // we finish what is already in flight.
  const timer = setTimeout(() => {
    console.error("[worker] drain timed out — exiting anyway");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  timer.unref();

  try {
    if (billingTimer) clearInterval(billingTimer);

    if (natsSubscription) {
      // drain() stops delivery and waits for handlers already dispatched,
      // so an in-flight ticket email is not abandoned half-sent.
      await natsSubscription.drain().catch(() => {});
    }
    if (natsConnection) {
      await natsConnection.drain().catch(() => {});
      await natsConnection.close().catch(() => {});
    }
    if (healthServer) {
      await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
    }
    await mongoose.disconnect().catch(() => {});
    console.log("[worker] drained cleanly");
    process.exit(0);
  } catch (err) {
    console.error("[worker] error during shutdown", err);
    process.exit(1);
  }
}

(async () => {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  await Connected(uri, { autoIndex: true });
  console.log("[worker] mongoose connected");

  startHealthServer(Number(process.env.WORKER_HEALTH_PORT || 4100));

  // run immediately, then hourly
  await runBillingSweep();
  billingTimer = setInterval(runBillingSweep, BILLING_INTERVAL_MS);

  // NATS subscription
  try {
    const url = process.env.EVENTS_URL || "nats://localhost:4222";
    natsConnection = await connect({ servers: url });
    natsSubscription = natsConnection.subscribe("ticket.events");

    void (async () => {
      for await (const m of natsSubscription!) {
        const evt = jc.decode(m.data); // { tenantId, event, ticketId, ... }
        if (
          evt.event === "ticket.created" ||
          evt.event === "ticket.replied" ||
          evt.event === "ticket.closed" ||
          evt.event === "ticket.assigned" ||
          evt.event === "ticket.reopened"
        ) {
          // One bad message must not tear down the subscription loop.
          await sendTicketEmail(evt.tenantId, evt.ticketId, evt.event).catch((err) =>
            console.error("[worker] ticket email failed", err)
          );
        }
      }
    })();
  } catch (e) {
    console.warn("[worker] NATS not connected; ticket emails disabled in this session.");
  }

  ready = true;
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
