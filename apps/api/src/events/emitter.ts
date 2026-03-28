import { busPublish } from "./bus";
import { EventEmitter } from "events";
export const bus = new EventEmitter();

// single point to fan-out events
export function emitTicketEvent(tenantId: string, payload: any) {
 try {
  bus.emit("ticket", payload);
  // NATS (if connected)
  busPublish?.("ticket.events", { tenantId, ...payload });
  // WebSocket (if initialized)
  (global as any).notifyTicket?.(tenantId, payload.ticketId, payload);
 } catch (error) {
    // swallow (log in non-test env)
    if (process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.error("[events] emit failed", error);
    }
 }
}
