/**
 * @module tests/integration.e2e
 * Phase 8: Cross-service integration test.
 * Full user journey through all core features in a single flow.
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Subscription } from "../../models/Subscription";
import { Survey } from "../../models/Survey";
import { SurveyResponse } from "../../models/SurveyResponse";

let app: any;

beforeAll(async () => { app = await testSetup(); });
afterAll(async () => { await testTeardown(); });

describe("Full User Journey (Phase 8.6)", () => {
  const slug = "integration-test";
  const email = "owner@integration.local";
  const password = "IntegratePass1";
  let accessToken: string;
  let refreshToken: string;
  let tenantId: string;
  let ticketId: string;

  test("1. signup creates tenant + owner", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "Integration Co", slug, plan: "COMPANY" },
      owner: { firstName: "Int", lastName: "Owner", email, password },
    });
    expect(res.status).toBe(201);
    expect(res.body.tenant.slug).toBe(slug);
    tenantId = res.body.tenant.id;
  });

  test("2. verify email activates user", async () => {
    const user = await User.findOne({ email });
    const res = await request(app).post("/api/v1/auth/verify").send({
      email, tenantSlug: slug, token: user!.emailVerification!.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("3. login returns access + refresh tokens", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email, password, tenantSlug: slug,
    });
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    expect(accessToken).toBeTruthy();
  });

  test("4. GET /me returns user info", async () => {
    const res = await request(app).get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.roles).toContain("OWNER");
  });

  test("5. create subscription", async () => {
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    const res = await request(app).post("/api/v1/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        planCode: "CO-20", prepayMonths: 1, startNow: true,
        tenantId: tenantId, status: "ACTIVE", interval: "MONTH",
        currentPeriodStart: now.toISOString(), currentPeriodEnd: end.toISOString(),
        provider: "manual", seats: 20, entitlements: { api: true, analytics: true },
      });
    expect(res.status).toBe(201);
  });

  test("6. ticket creation works with active subscription", async () => {
    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ subject: "Integration Ticket", body: "Full flow test", priority: "HIGH", customerEmail: "customer@int.com" });
    expect(res.status).toBe(201);
    ticketId = res.body.data._id;
  });

  test("7. reply to ticket", async () => {
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/reply`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ body: "Agent response" });
    expect(res.status).toBe(201);
  });

  test("8. get ticket shows comments", async () => {
    const res = await request(app).get(`/api/v1/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.comments.length).toBe(1);
  });

  test("9. close ticket", async () => {
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/close`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CLOSED");
  });

  test("10. reopen ticket", async () => {
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/reopen`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REOPENED");
  });

  test("11. create customer", async () => {
    const res = await request(app).post("/api/v1/customers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Int Customer", email: "customer@int.com" });
    expect(res.status).toBe(201);
  });

  test("12. list customers returns the created customer", async () => {
    const res = await request(app).get("/api/v1/customers?q=Int")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test("13. invite a new user", async () => {
    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "agent@int.local", firstName: "New", lastName: "Agent", roles: ["AGENT"] });
    expect(res.status).toBe(201);
  });

  test("14. list users shows owner + invited", async () => {
    const res = await request(app).get("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.seats.used).toBe(2);
  });

  test("15. update branding", async () => {
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Rebranded Co", primaryColor: "#FF0000" });
    expect(res.status).toBe(200);
    expect(res.body.data.branding.name).toBe("Rebranded Co");
  });

  test("16. create survey template", async () => {
    const res = await request(app).post("/api/v1/surveys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        key: "int_csat", name: "Integration CSAT",
        questions: [{ key: "rating", label: "Rate us", type: "RATING" }],
      });
    expect(res.status).toBe(201);
  });

  test("17. survey analytics returns empty for new survey", async () => {
    const survey = await Survey.findOne({ key: "int_csat" });
    const res = await request(app).get(`/api/v1/surveys/${survey!._id}/analytics`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalResponses).toBe(0);
  });

  test("18. refresh token returns new access token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh")
      .set("Authorization", `Bearer ${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    accessToken = res.body.accessToken;
  });

  test("19. subscription guard blocks writes after expiry", async () => {
    // Expire the subscription
    await Subscription.updateOne({ tenantId }, {
      status: "EXPIRED",
      currentPeriodEnd: new Date(Date.now() - 86400000),
      graceUntil: new Date(Date.now() - 86400000),
    });

    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ subject: "Blocked", body: "test", priority: "LOW", customerEmail: "x@y.com" });
    expect(res.status).toBe(402);

    // Restore
    await Subscription.updateOne({ tenantId }, {
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      graceUntil: null,
    });
  });

  test("20. logout clears session", async () => {
    const res = await request(app).post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});
