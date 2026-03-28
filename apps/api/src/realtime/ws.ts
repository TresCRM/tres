import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { busPublish, busConnect } from "../events/bus";
import { verifyToken } from "../utils/auth";

type Client = { ws: WebSocket, tenantId: string, userId: string };
const CLIENTS = new Map<WebSocket, Client>();

export function attachWebsocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  busConnect(process.env.EVENTS_URL).catch(()=>{});

  wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
      try {
        const payload = JSON.parse(msg.toString());
        if (payload.type === "hello") {
          const jwt = payload.token;
          if (!jwt) {
            ws.send(JSON.stringify({ type: "error", message: "Token required" }));
            ws.close(4001, "Token required");
            return;
          }
          try {
            const auth = verifyToken(jwt);
            CLIENTS.set(ws, { ws, tenantId: auth.tid, userId: auth.sub });
            broadcastPresence(auth.tid, auth.sub, "online");
            ws.send(JSON.stringify({ type: "hello_ack", userId: auth.sub }));
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            ws.close(4003, "Invalid token");
          }
        }
      } catch {}
    });

    ws.on("close", () => {
      const c = CLIENTS.get(ws);
      if (c) {
        broadcastPresence(c.tenantId, c.userId, "offline");
        CLIENTS.delete(ws);
      }
    });
  });

  function broadcastPresence(tenantId: string, userId: string, status:"online"|"offline") {
    for (const c of CLIENTS.values()) {
      if (c.tenantId === tenantId) c.ws.send(JSON.stringify({ type:"presence", userId, status }));
    }
    busPublish("presence.changed", { event:"presence.changed", tenantId, userId, status });
  }

  // helper for ticket events
  (global as any).notifyTicket = (tenantId: string, ticketId: string, payload:any) => {
    for (const c of CLIENTS.values()) {
      if (c.tenantId === tenantId) c.ws.send(JSON.stringify({ type:"ticket", ticketId, ...payload }));
    }
    busPublish("ticket.events", payload);
  };
}
