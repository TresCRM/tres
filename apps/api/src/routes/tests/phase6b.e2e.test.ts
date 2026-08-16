/**
 * @module tests/phase6b.e2e
 * Phase 6b: Embeddable Support Widget -- comprehensive test suite.
 * Covers: widget token CRUD, public widget config, widget ticket create/track/reply,
 * domain validation, security, tracking token scoping.
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { WidgetToken } from "../../models/WidgetToken";
import { Ticket } from "../../models/Ticket";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: `${slug} Co` }, plan: "COMPANY", seats: 5 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: `${slug}@test.local`, passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  return { tenant, user, token, tid: String(tenant._id) };
}

/* ================================================================== */
/*  1. Widget Token CRUD (6b.4)                                        */
/* ================================================================== */

describe("Widget Token Management (Phase 6b.4)", () => {
  let token: string;
  let widgetToken: string;

  beforeAll(async () => {
    const s = await setup("wt-crud");
    token = s.token;
  });

  test("generate widget token", async () => {
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.token).toMatch(/^pub_/);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.greeting).toBe("Hi! How can we help?");
    widgetToken = res.body.data.token;
  });

  test("duplicate generate returns 409", async () => {
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  test("get widget token (masked)", async () => {
    const res = await request(app).get("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toContain("****");
    expect(res.body.data.token).not.toBe(widgetToken); // masked
    expect(res.body.data.greeting).toBe("Hi! How can we help?");
  });

  test("update widget settings (greeting, position)", async () => {
    const res = await request(app).put("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ greeting: "Need help?", position: "bottom-left" });
    expect(res.status).toBe(200);
    expect(res.body.data.greeting).toBe("Need help?");
    expect(res.body.data.position).toBe("bottom-left");
  });

  test("update allowed domains", async () => {
    const res = await request(app).put("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`)
      .send({ allowedDomains: ["https://mysite.com", "https://app.mysite.com"] });
    expect(res.status).toBe(200);
    expect(res.body.data.allowedDomains).toEqual(["https://mysite.com", "https://app.mysite.com"]);
  });

  test("revoke widget token", async () => {
    const res = await request(app).delete("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("get after revoke returns 404", async () => {
    const res = await request(app).get("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("can generate new token after revoke", async () => {
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.token).toMatch(/^pub_/);
    widgetToken = res.body.data.token;
  });
});

/* ================================================================== */
/*  2. Public Widget Config (6b.3)                                     */
/* ================================================================== */

describe("Public Widget Config (Phase 6b.3)", () => {
  let widgetToken: string;

  beforeAll(async () => {
    const s = await setup("wt-config");
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${s.token}`);
    widgetToken = res.body.data.token;
  });

  test("GET /public/widget/config returns branding and widget settings", async () => {
    const res = await request(app)
      .get(`/public/widget/config?token=${widgetToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tenant.name).toBe("wt-config Co");
    expect(res.body.data.branding).toBeDefined();
    expect(res.body.data.widget.greeting).toBeTruthy();
    expect(res.body.data.widget.position).toBeTruthy();
  });

  test("invalid widget token returns 401", async () => {
    const res = await request(app)
      .get("/public/widget/config?token=pub_invalid_token_12345");
    expect(res.status).toBe(401);
  });

  test("missing token returns 401", async () => {
    const res = await request(app).get("/public/widget/config");
    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
/*  3. Widget Ticket Create + Track + Reply (6b.3)                     */
/* ================================================================== */

describe("Widget Ticket Flow (Phase 6b.3)", () => {
  let widgetToken: string;
  let ticketId: string;
  let trackingToken: string;
  let tenantSlug: string;

  beforeAll(async () => {
    const s = await setup("wt-tickets");
    tenantSlug = "wt-tickets";
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${s.token}`);
    widgetToken = res.body.data.token;
  });

  test("create ticket from widget", async () => {
    const res = await request(app).post("/public/widget/tickets")
      .send({
        widgetToken,
        name: "Widget User",
        email: "widget@customer.com",
        subject: "Help from widget",
        body: "I can't login to my account",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.ticketId).toBeTruthy();
    expect(res.body.data.status).toBe("OPEN");
    expect(res.body.trackingToken).toBeTruthy(); // exposed in test mode
    ticketId = res.body.data.ticketId;
    trackingToken = res.body.trackingToken;
  });

  test("track ticket via tracking token", async () => {
    const res = await request(app)
      .get(`/public/widget/tickets/${ticketId}?trackingToken=${encodeURIComponent(trackingToken)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe("Help from widget");
    expect(res.body.data.status).toBe("OPEN");
    expect(res.body.data.comments).toBeDefined();
  });

  test("reply to ticket from widget", async () => {
    const res = await request(app)
      .post(`/public/widget/tickets/${ticketId}/reply`)
      .send({ body: "Thanks for looking into this!", trackingToken });
    expect(res.status).toBe(201);
    expect(res.body.data.commentId).toBeTruthy();
  });

  test("reply is marked as non-agent", async () => {
    const res = await request(app)
      .get(`/public/widget/tickets/${ticketId}?trackingToken=${encodeURIComponent(trackingToken)}`);
    const reply = res.body.data.comments.find((c: any) => c.body.includes("Thanks for looking"));
    expect(reply).toBeTruthy();
    expect(reply.isAgent).toBe(false);
  });

  test("ticket body is sanitized", async () => {
    const res = await request(app).post("/public/widget/tickets")
      .send({
        widgetToken,
        email: "xss@test.com",
        subject: "XSS test",
        body: '<p>Help</p><script>evil()</script>',
      });
    expect(res.status).toBe(201);
    const ticket = await Ticket.findById(res.body.data.ticketId).lean();
    expect(ticket!.body).not.toContain("<script>");
    expect(ticket!.body).toContain("<p>Help</p>");
  });

  test("increments tenant lifetimeTicketCount", async () => {
    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
    expect(tenant!.lifetimeTicketCount).toBeGreaterThanOrEqual(2);
  });

  test("invalid widget token on create returns 401", async () => {
    const res = await request(app).post("/public/widget/tickets")
      .send({ widgetToken: "pub_fake", email: "x@y.com", subject: "Test", body: "test" });
    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
/*  4. Tracking Token Security (6b.6)                                  */
/* ================================================================== */

describe("Widget Security (Phase 6b.6)", () => {
  let widgetToken: string;
  let ticketId: string;
  let trackingToken: string;

  beforeAll(async () => {
    const s = await setup("wt-security");
    const wtRes = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${s.token}`);
    widgetToken = wtRes.body.data.token;

    const ticketRes = await request(app).post("/public/widget/tickets")
      .send({ widgetToken, email: "legit@user.com", subject: "Security test", body: "test" });
    ticketId = ticketRes.body.data.ticketId;
    trackingToken = ticketRes.body.trackingToken;
  });

  test("wrong email in tracking token cannot view ticket", async () => {
    // Forge a tracking token with different email
    const jwt = require("jsonwebtoken");
    const forged = jwt.sign(
      { email: "hacker@evil.com", tid: "000000000000000000000000", ticketId, type: "widget_tracking" },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get(`/public/widget/tickets/${ticketId}?trackingToken=${encodeURIComponent(forged)}`);
    expect(res.status).toBe(403);
  });

  test("tracking token without type field is rejected", async () => {
    const jwt = require("jsonwebtoken");
    const noType = jwt.sign({ email: "legit@user.com", tid: "x", ticketId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
    const res = await request(app)
      .get(`/public/widget/tickets/${ticketId}?trackingToken=${encodeURIComponent(noType)}`);
    expect(res.status).toBe(401);
  });

  test("missing tracking token returns 401", async () => {
    const res = await request(app).get(`/public/widget/tickets/${ticketId}`);
    expect(res.status).toBe(401);
  });

  test("cannot reply to closed ticket from widget", async () => {
    // Close the ticket first
    await Ticket.updateOne({ _id: ticketId }, { status: "CLOSED" });
    const res = await request(app)
      .post(`/public/widget/tickets/${ticketId}/reply`)
      .send({ body: "Late reply", trackingToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ticket_closed");
    // Restore
    await Ticket.updateOne({ _id: ticketId }, { status: "OPEN" });
  });

  test("AGENT cannot manage widget tokens (no SETTINGS_UPDATE)", async () => {
    const s = await setup("wt-rbac");
    const agent = await User.create({
      tenantId: s.tenant._id, firstName: "Ag", lastName: "T",
      email: "ag@wt.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["AGENT"], status: "ACTIVE",
    });
    const agentToken = signAccessToken({ sub: String(agent._id), tid: s.tid, roles: ["AGENT"] });
    const res = await request(app).post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });
});
