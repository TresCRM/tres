/**
 * @module tests/websocket.e2e
 * Phase 8: WebSocket authentication tests.
 * Tests JWT handshake validation (valid, missing, invalid, expired tokens).
 */
import http from "http";
import WebSocket from "ws";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { hashPassword, signAccessToken } from "../../utils/auth";
import { attachWebsocket } from "../../realtime/ws";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
let server: http.Server;
let port: number;

beforeAll(async () => {
  app = await testSetup();
  server = http.createServer(app);
  attachWebsocket(server);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await testTeardown();
}, 15000);

async function createUserToken(slug: string): Promise<string> {
  const tenant = await Tenant.create({ slug, branding: { name: slug }, plan: "COMPANY", seats: 5 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "WS", lastName: "User",
    email: `${slug}@ws.local`, passwordHash: await hashPassword("TestPass1"),
    roles: ["OWNER"] as Role[], status: "ACTIVE",
  });
  return signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles: ["OWNER"] });
}

function connectWS(): WebSocket {
  return new WebSocket(`ws://localhost:${port}/ws`);
}

function waitMsg(ws: WebSocket, ms = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    ws.once("message", (d) => { clearTimeout(t); resolve(JSON.parse(d.toString())); });
  });
}

function waitClose(ws: WebSocket, ms = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    ws.once("close", (code) => { clearTimeout(t); resolve(code); });
  });
}

describe("WebSocket Auth (Phase 8.3)", () => {
  test("valid token gets authenticated (receives presence or hello_ack)", async () => {
    const token = await createUserToken("ws-ok");
    const ws = connectWS();
    await new Promise<void>(r => ws.on("open", r));
    ws.send(JSON.stringify({ type: "hello", token }));

    // Server sends presence broadcast (self) and hello_ack; first one received proves auth succeeded
    const msg = await waitMsg(ws);
    expect(["hello_ack", "presence"]).toContain(msg.type);
    // If presence, userId should be present (proves we authenticated)
    if (msg.type === "presence") expect(msg.userId).toBeTruthy();
    if (msg.type === "hello_ack") expect(msg.userId).toBeTruthy();
    ws.close();
  });

  test("missing token returns error + close 4001", async () => {
    const ws = connectWS();
    await new Promise<void>(r => ws.on("open", r));
    ws.send(JSON.stringify({ type: "hello" }));
    const msg = await waitMsg(ws);
    expect(msg.type).toBe("error");
    expect(msg.message).toBe("Token required");
    const code = await waitClose(ws);
    expect(code).toBe(4001);
  });

  test("invalid token returns error + close 4003", async () => {
    const ws = connectWS();
    await new Promise<void>(r => ws.on("open", r));
    ws.send(JSON.stringify({ type: "hello", token: "bad.jwt.token" }));
    const msg = await waitMsg(ws);
    expect(msg.type).toBe("error");
    const code = await waitClose(ws);
    expect(code).toBe(4003);
  });

  test("expired token is rejected", async () => {
    const jwt = require("jsonwebtoken");
    const expired = jwt.sign({ sub: "x", tid: "y", roles: ["OWNER"] }, process.env.JWT_SECRET!, { expiresIn: "0s" });
    await new Promise(r => setTimeout(r, 100));

    const ws = connectWS();
    await new Promise<void>(r => ws.on("open", r));
    ws.send(JSON.stringify({ type: "hello", token: expired }));
    const msg = await waitMsg(ws);
    expect(msg.type).toBe("error");
    const code = await waitClose(ws);
    expect(code).toBe(4003);
  });
});
