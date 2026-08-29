/**
 * Stage 2: Communication & Collaboration Layer -- E2E Tests
 * Covers: internal messaging, live chat, notifications, expanded webhooks, isInternal comments
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Notification } from "../../models/Notification";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: slug + " Co" }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: slug + "@test.local", passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  await seedActiveSubscription(String(tenant._id));
  return { tenant, user, token, tid: String(tenant._id), uid: String(user._id) };
}

async function createAgent(tenantId: string, slug: string) {
  const user = await User.create({
    tenantId, firstName: "Agent", lastName: slug,
    email: "agent-" + slug + "@test.local", passwordHash: await hashPassword("TestPass1"),
    roles: ["AGENT"] as Role[], status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: tenantId, roles: ["AGENT"] });
  return { user, token, uid: String(user._id) };
}

/* ================================================================== */
/*  1. Internal Messaging                                              */
/* ================================================================== */
describe("Internal Messaging (Stage 2.1)", () => {
  let ownerToken: string, agentToken: string, agentId: string;

  beforeAll(async () => {
    const s = await setup("msg-test");
    ownerToken = s.token;
    const a = await createAgent(s.tid, "msg1");
    agentToken = a.token; agentId = a.uid;
  });

  test("send direct message", async () => {
    const res = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "DIRECT", recipientId: agentId, content: "Hello agent!" });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe("DIRECT");
    expect(res.body.data.content).toBe("Hello agent!");
  });

  test("get direct conversation", async () => {
    const res = await request(app).get("/api/v1/messages/direct/" + agentId)
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("send channel message", async () => {
    const res = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "CHANNEL", channelName: "general", content: "Team announcement" });
    expect(res.status).toBe(201);
    expect(res.body.data.channelName).toBe("general");
  });

  test("get channel messages", async () => {
    const res = await request(app).get("/api/v1/messages/channels/general")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("send ticket internal note", async () => {
    const ticket = await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ subject: "Note test", body: "test body", priority: "LOW" });
    const ticketId = ticket.body.data._id;
    const res = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "TICKET_NOTE", ticketId, content: "Internal note for team" });
    expect(res.status).toBe(201);
    expect(res.body.data.ticketId).toBe(ticketId);
  });

  test("edit own message within 5 minutes", async () => {
    const sent = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "DIRECT", recipientId: agentId, content: "Typo" });
    const msgId = sent.body.data._id;
    const res = await request(app).put("/api/v1/messages/" + msgId)
      .set("Authorization", "Bearer " + ownerToken)
      .send({ content: "Fixed typo" });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("Fixed typo");
    expect(res.body.data.isEdited).toBe(true);
  });

  test("soft-delete own message", async () => {
    const sent = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "DIRECT", recipientId: agentId, content: "Delete me" });
    const res = await request(app).delete("/api/v1/messages/" + sent.body.data._id)
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
  });

  test("mark message as read", async () => {
    const sent = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "DIRECT", recipientId: agentId, content: "Read this" });
    const res = await request(app).post("/api/v1/messages/" + sent.body.data._id + "/read")
      .set("Authorization", "Bearer " + agentToken);
    expect(res.status).toBe(200);
  });

  test("get unread counts", async () => {
    const res = await request(app).get("/api/v1/messages/unread")
      .set("Authorization", "Bearer " + agentToken);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.direct).toBe("number");
    expect(typeof res.body.data.channels).toBe("number");
  });

  test("rejects missing content", async () => {
    const res = await request(app).post("/api/v1/messages")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ type: "DIRECT", recipientId: agentId });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  2. Live Chat                                                       */
/* ================================================================== */
describe("Live Chat (Stage 2.2)", () => {
  let agentToken: string;
  let sessionId: string, visitorId: string;

  beforeAll(async () => {
    const s = await setup("chat-test");
    const a = await createAgent(s.tid, "chat1");
    agentToken = a.token;
  });

  test("visitor starts a chat", async () => {
    const res = await request(app).post("/api/v1/chat/start")
      .send({ tenantSlug: "chat-test", visitorName: "John Doe", visitorEmail: "john@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.visitorId).toBeDefined();
    sessionId = res.body.sessionId;
    visitorId = res.body.visitorId;
  });

  test("visitor sends a message", async () => {
    const res = await request(app).post("/api/v1/chat/" + sessionId + "/message")
      .send({ visitorId, content: "I need help!" });
    expect(res.status).toBe(200);
  });

  test("agent sees chat in queue", async () => {
    const res = await request(app).get("/api/v1/chat/queue")
      .set("Authorization", "Bearer " + agentToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test("agent accepts chat", async () => {
    const res = await request(app).post("/api/v1/chat/" + sessionId + "/accept")
      .set("Authorization", "Bearer " + agentToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  test("agent replies", async () => {
    const res = await request(app).post("/api/v1/chat/" + sessionId + "/reply")
      .set("Authorization", "Bearer " + agentToken)
      .send({ content: "How can I help?" });
    expect(res.status).toBe(200);
  });

  test("visitor polls messages", async () => {
    const res = await request(app).get("/api/v1/chat/" + sessionId + "/messages")
      .query({ visitorId });
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
  });

  test("agent ends chat and creates ticket", async () => {
    const res = await request(app).post("/api/v1/chat/" + sessionId + "/end")
      .set("Authorization", "Bearer " + agentToken);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("ENDED");
    expect(res.body.ticketId).toBeDefined();
  });

  test("start chat with invalid tenant returns 404", async () => {
    const res = await request(app).post("/api/v1/chat/start")
      .send({ tenantSlug: "nonexistent", visitorName: "X" });
    expect(res.status).toBe(404);
  });

  test("visitor cannot message ended session", async () => {
    const res = await request(app).post("/api/v1/chat/" + sessionId + "/message")
      .send({ visitorId, content: "More?" });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  3. Notifications                                                   */
/* ================================================================== */
describe("Notifications (Stage 2.3)", () => {
  let ownerToken: string, uid: string, tid: string;

  beforeAll(async () => {
    const s = await setup("notif-test");
    ownerToken = s.token; uid = s.uid; tid = s.tid;
    await Notification.create([
      { tenantId: tid, userId: uid, type: "ticket.assigned", title: "Assigned", body: "Ticket #1", isRead: false },
      { tenantId: tid, userId: uid, type: "ticket.replied", title: "Reply", body: "Ticket #2", isRead: false },
      { tenantId: tid, userId: uid, type: "billing", title: "Payment", body: "Processed", isRead: true, readAt: new Date() },
    ]);
  });

  test("list all notifications", async () => {
    const res = await request(app).get("/api/v1/notifications")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  test("filter unread only", async () => {
    const res = await request(app).get("/api/v1/notifications")
      .query({ isRead: false })
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  test("get unread count", async () => {
    const res = await request(app).get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  test("mark one as read", async () => {
    const list = await request(app).get("/api/v1/notifications")
      .query({ isRead: false })
      .set("Authorization", "Bearer " + ownerToken);
    const id = list.body.data[0]._id;
    const res = await request(app).post("/api/v1/notifications/" + id + "/read")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    const count = await request(app).get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer " + ownerToken);
    expect(count.body.count).toBe(1);
  });

  test("mark all as read", async () => {
    const res = await request(app).post("/api/v1/notifications/read-all")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    const count = await request(app).get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer " + ownerToken);
    expect(count.body.count).toBe(0);
  });
});

/* ================================================================== */
/*  4. Expanded Webhooks                                               */
/* ================================================================== */
describe("Expanded Webhook Events (Stage 2.4)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("wh-test");
    ownerToken = s.token;
  });

  test("register webhook with new events", async () => {
    const res = await request(app).post("/api/v1/webhooks")
      .set("Authorization", "Bearer " + ownerToken)
      .send({
        url: "https://example.com/hook",
        events: ["ticket.sla_breach", "ticket.merged", "chat.started", "customer.created", "user.invited"],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.events).toContain("ticket.sla_breach");
    expect(res.body.data.events).toContain("chat.started");
  });

  test("reject invalid event type", async () => {
    const res = await request(app).post("/api/v1/webhooks")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ url: "https://example.com/hook2", events: ["bogus.event"] });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  5. Comment isInternal                                              */
/* ================================================================== */
describe("Comment isInternal (Stage 2)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("cmt-internal");
    ownerToken = s.token;
  });

  test("reply with isInternal=true", async () => {
    const t = await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ subject: "Internal", body: "test", priority: "LOW" });
    const res = await request(app).post("/api/v1/tickets/" + t.body.data._id + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "Internal note", isInternal: true });
    expect(res.status).toBe(201);
    expect(res.body.data.isInternal).toBe(true);
  });

  test("reply defaults to isInternal=false", async () => {
    const t = await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ subject: "Public", body: "test", priority: "LOW" });
    const res = await request(app).post("/api/v1/tickets/" + t.body.data._id + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "Public reply" });
    expect(res.status).toBe(201);
    expect(res.body.data.isInternal).toBeFalsy();
  });
});
