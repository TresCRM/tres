import { Server, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { busPublish, busConnect } from "../events/bus";
import { verifyToken } from "../utils/auth";
import { ENV } from "../config/env";

type Client = { ws: WebSocket, tenantId: string, userId: string };
const CLIENTS = new Map<WebSocket, Client>();

const AUTH_TIMEOUT_MS = 5_000; // close if no valid hello within 5s

function isOriginAllowed(origin: string | undefined): boolean {
  if (ENV.IS_TEST) return true;
  if (!origin) return false;
  return ENV.ALLOWED_ORIGINS.includes(origin);
}

export function attachWebsocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      return isOriginAllowed(req.headers.origin);
    },
  });
  busConnect(process.env.EVENTS_URL).catch(()=>{});

  wss.on("connection", (ws) => {
    // Per-connection rate limiting: max 60 messages per minute
    let msgCount = 0;
    const msgResetInterval = setInterval(() => { msgCount = 0; }, 60000);

    // Auth timeout: close if no authenticated hello within 5s
    let authenticated = false;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4000, "Auth timeout");
      }
    }, AUTH_TIMEOUT_MS);

    // Heartbeat: detect stale connections
    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });

    ws.on("message", (msg) => {
      msgCount++;
      if (msgCount > 60) {
        ws.close(1008, "Rate limited");
        return;
      }
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
            authenticated = true;
            clearTimeout(authTimeout);
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

    ws.on("error", () => {
      clearTimeout(authTimeout);
      CLIENTS.delete(ws);
      clearInterval(msgResetInterval);
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      const c = CLIENTS.get(ws);
      if (c) {
        broadcastPresence(c.tenantId, c.userId, "offline");
        CLIENTS.delete(ws);
      }
      clearInterval(msgResetInterval);
    });
  });

  // Heartbeat: terminate stale connections every 30 seconds
  const heartbeat = setInterval(() => {
    for (const [ws, client] of CLIENTS) {
      if (!(ws as any).isAlive) {
        CLIENTS.delete(ws);
        ws.terminate();
        continue;
      }
      (ws as any).isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

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
