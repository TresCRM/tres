import { connect, JSONCodec, NatsConnection } from "nats";

const jc = JSONCodec<any>();
let nc: NatsConnection | null = null;

/** Well-known event subjects for per-type routing. */
export const SUBJECTS = {
  TICKET_CREATED: "ticket.created",
  TICKET_REPLIED: "ticket.replied",
  TICKET_CLOSED: "ticket.closed",
  TICKET_ASSIGNED: "ticket.assigned",
  TICKET_REOPENED: "ticket.reopened",
  BILLING: "billing.events",
  DLQ: "events.dlq",
} as const;

export async function busConnect(url?: string) {
  if (nc || !url) return nc;
  nc = await connect({
    servers: url,
    maxReconnectAttempts: 10,
    reconnectTimeWait: 2000,
  });
  return nc;
}

/** Graceful drain and disconnect. */
export async function busDisconnect() {
  if (!nc) return;
  try {
    await nc.drain();
  } catch {
    // already closed
  }
  nc = null;
}

export async function busPublish(subject: string, data: any) {
  if (!nc) return; // in tests, bus may be off
  nc.publish(subject, jc.encode(data));
}

export async function busSubscribe(
  subject: string,
  handler: (data: any) => void,
) {
  if (!nc) return;
  const sub = nc.subscribe(subject);
  (async () => {
    for await (const m of sub) handler(jc.decode(m.data));
  })();
}

interface SubscribeWithRetryOpts {
  maxConsecutiveFailures?: number;
}

/**
 * Subscribe with automatic retry/dead-letter semantics.
 * After `maxConsecutiveFailures` (default 3) consecutive handler errors on the
 * same message, the payload is forwarded to `${subject}.dlq` and processing
 * continues with the next message.
 */
export async function busSubscribeWithRetry(
  subject: string,
  handler: (data: any) => void | Promise<void>,
  opts?: SubscribeWithRetryOpts,
) {
  if (!nc) return;
  const maxFailures = opts?.maxConsecutiveFailures ?? 3;
  const sub = nc.subscribe(subject);

  (async () => {
    for await (const m of sub) {
      const payload = jc.decode(m.data);
      let failures = 0;
      let succeeded = false;

      while (failures < maxFailures && !succeeded) {
        try {
          await handler(payload);
          succeeded = true;
        } catch (err) {
          failures++;
          console.error(
            `[bus] handler error on ${subject} (attempt ${failures}/${maxFailures}):`,
            err,
          );
        }
      }

      if (!succeeded) {
        // Dead-letter after exhausting retries
        const dlqSubject = `${subject}.dlq`;
        console.error(
          `[bus] dead-lettering message on ${subject} -> ${dlqSubject}`,
        );
        try {
          nc!.publish(
            dlqSubject,
            jc.encode({ originalSubject: subject, payload, failures }),
          );
        } catch (dlqErr) {
          console.error(`[bus] failed to publish to DLQ:`, dlqErr);
        }
      }
    }
  })();
}
