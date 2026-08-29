/**
 * @module tests/phase3.e2e
 * Phase 3: Missing Data Models & Core API Routes -- comprehensive test suite.
 * Covers: ticket reopen/reassign, customer CRUD, user management,
 * branding settings, survey analytics.
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { Customer } from "../../models/Customer";
import { SurveyResponse } from "../../models/SurveyResponse";
import { Survey } from "../../models/Survey";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: `${slug} Co` }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: `${slug}@test.local`, passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  await seedActiveSubscription(String(tenant._id));
  return { tenant, user, token, tid: String(tenant._id), uid: String(user._id) };
}

/* ================================================================== */
/*  1. Ticket Reopen (3.1)                                             */
/* ================================================================== */

describe("Ticket Reopen (Phase 3.1)", () => {
  let token: string, tid: string;

  beforeAll(async () => {
    const s = await setup("reopen-test");
    token = s.token; tid = s.tid;
  });

  test("reopen a CLOSED ticket", async () => {
    // Create + close
    const created = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Reopen me", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    await request(app).post(`/api/v1/tickets/${id}/close`)
      .set("Authorization", `Bearer ${token}`).expect(200);

    // Reopen
    const res = await request(app).post(`/api/v1/tickets/${id}/reopen`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REOPENED");
  });

  test("cannot reopen an OPEN ticket", async () => {
    const created = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Active", body: "test", priority: "LOW", customerEmail: "c2@t.com" });
    const res = await request(app).post(`/api/v1/tickets/${created.body.data._id}/reopen`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_transition");
  });

  test("reopen 404 for nonexistent ticket", async () => {
    const res = await request(app).post("/api/v1/tickets/000000000000000000000000/reopen")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  2. Ticket Reassign with SLA History (3.1b)                         */
/* ================================================================== */

describe("Ticket Reassign (Phase 3.1b)", () => {
  let token: string, tid: string, agentId: string;

  beforeAll(async () => {
    const s = await setup("reassign-test");
    token = s.token; tid = s.tid;
    const agent = await User.create({
      tenantId: s.tenant._id, firstName: "Agent", lastName: "B",
      email: "agent@reassign.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["AGENT"], status: "ACTIVE",
    });
    agentId = String(agent._id);
  });

  test("reassign a ticket and track history", async () => {
    // Create + assign
    const created = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Reassign me", body: "test", priority: "HIGH", customerEmail: "r@t.com" });
    const id = created.body.data._id;

    await request(app).post(`/api/v1/tickets/${id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeId: agentId });

    // Reassign
    const res = await request(app).post(`/api/v1/tickets/${id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeId: agentId });
    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBe(agentId);
  });

  test("cannot reassign a CLOSED ticket", async () => {
    const created = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Closed", body: "test", priority: "LOW", customerEmail: "r2@t.com" });
    const id = created.body.data._id;
    await request(app).post(`/api/v1/tickets/${id}/close`).set("Authorization", `Bearer ${token}`);

    const res = await request(app).post(`/api/v1/tickets/${id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeId: agentId });
    expect(res.status).toBe(400);
  });

  test("reassign requires assigneeId", async () => {
    const created = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "NoAssignee", body: "test", priority: "LOW", customerEmail: "r3@t.com" });
    const res = await request(app).post(`/api/v1/tickets/${created.body.data._id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  3. Customer CRUD (3.2)                                             */
/* ================================================================== */

describe("Customer CRUD (Phase 3.2)", () => {
  let token: string, tid: string;
  let customerId: string;

  beforeAll(async () => {
    const s = await setup("cust-crud");
    token = s.token; tid = s.tid;
  });

  test("create a customer", async () => {
    const res = await request(app).post("/api/v1/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Jane Doe", email: "jane@example.com", phone: "+1234567890", company: "Acme Inc" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Jane Doe");
    expect(res.body.data.email).toBe("jane@example.com");
    customerId = res.body.data._id;
  });

  test("duplicate email returns 409", async () => {
    const res = await request(app).post("/api/v1/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Jane Again", email: "jane@example.com" });
    expect(res.status).toBe(409);
  });

  test("list customers", async () => {
    const res = await request(app).get("/api/v1/customers")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("search customers by name", async () => {
    const res = await request(app).get("/api/v1/customers?q=Jane")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test("get single customer", async () => {
    const res = await request(app).get(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Jane Doe");
  });

  test("update customer", async () => {
    const res = await request(app).put(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ company: "New Corp" });
    expect(res.status).toBe(200);
    expect(res.body.data.company).toBe("New Corp");
  });

  test("delete customer", async () => {
    const res = await request(app).delete(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("get deleted customer returns 404", async () => {
    const res = await request(app).get(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("READONLY cannot create customers", async () => {
    const s = await setup("cust-ro");
    const roUser = await User.create({
      tenantId: s.tenant._id, firstName: "RO", lastName: "U",
      email: "ro@cust.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["READONLY"], status: "ACTIVE",
    });
    const roToken = signAccessToken({ sub: String(roUser._id), tid: s.tid, roles: ["READONLY"] });
    const res = await request(app).post("/api/v1/customers")
      .set("Authorization", `Bearer ${roToken}`)
      .send({ name: "Blocked", email: "blocked@test.com" });
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  4. User Management (3.3)                                           */
/* ================================================================== */

describe("User Management (Phase 3.3)", () => {
  let ownerToken: string, tid: string, ownerId: string;
  let invitedUserId: string;

  beforeAll(async () => {
    const s = await setup("user-mgmt");
    ownerToken = s.token; tid = s.tid; ownerId = s.uid;
  });

  test("invite a new user", async () => {
    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "invited@user.local", firstName: "New", lastName: "Agent", roles: ["AGENT"] });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("invited@user.local");
    expect(res.body.data.roles).toEqual(["AGENT"]);
    expect(res.body.data.status).toBe("PENDING");
    invitedUserId = res.body.data.id;
  });

  test("duplicate invite returns 409", async () => {
    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "invited@user.local", firstName: "Dup", lastName: "User", roles: ["AGENT"] });
    expect(res.status).toBe(409);
  });

  test("invite with invalid role returns 400", async () => {
    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "bad@role.local", firstName: "Bad", lastName: "Role", roles: ["SUPERADMIN"] });
    expect(res.status).toBe(400);
  });

  test("list users with seat count", async () => {
    const res = await request(app).get("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.seats).toBeDefined();
    expect(res.body.seats.used).toBeGreaterThanOrEqual(2);
    expect(res.body.seats.total).toBe(20);
  });

  test("get single user", async () => {
    const res = await request(app).get(`/api/v1/users/${invitedUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("invited@user.local");
  });

  test("update user roles (OWNER only)", async () => {
    const res = await request(app).put(`/api/v1/users/${invitedUserId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ roles: ["AGENT", "BILLING"] });
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual(["AGENT", "BILLING"]);
  });

  test("cannot remove OWNER from yourself", async () => {
    const res = await request(app).put(`/api/v1/users/${ownerId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ roles: ["AGENT"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_remove_own_owner");
  });

  test("disable user", async () => {
    const res = await request(app).put(`/api/v1/users/${invitedUserId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "DISABLED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DISABLED");
  });

  test("cannot disable yourself", async () => {
    const res = await request(app).put(`/api/v1/users/${ownerId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "DISABLED" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_disable_self");
  });

  test("re-enable user", async () => {
    const res = await request(app).put(`/api/v1/users/${invitedUserId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  test("delete user (OWNER only)", async () => {
    const res = await request(app).delete(`/api/v1/users/${invitedUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("cannot delete yourself", async () => {
    const res = await request(app).delete(`/api/v1/users/${ownerId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_remove_self");
  });

  test("AGENT cannot invite users", async () => {
    const agentUser = await User.create({
      tenantId: (await Tenant.findOne({ slug: "user-mgmt" }))!._id,
      firstName: "Ag", lastName: "Ent",
      email: "ag@user.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["AGENT"], status: "ACTIVE",
    });
    const agentToken = signAccessToken({ sub: String(agentUser._id), tid, roles: ["AGENT"] });
    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ email: "new@test.local", firstName: "N", lastName: "U", roles: ["AGENT"] });
    expect(res.status).toBe(403);
  });

  test("seat limit enforcement", async () => {
    // Set subscription to 2 seats
    const { Subscription } = await import("../../models/Subscription");
    const tenant = await Tenant.findOne({ slug: "user-mgmt" });
    await Subscription.updateOne({ tenantId: tenant!._id }, { seats: 2 });

    const res = await request(app).post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "over@limit.local", firstName: "Over", lastName: "Limit", roles: ["AGENT"] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("seat_limit_reached");
  });
});

/* ================================================================== */
/*  5. Branding Settings (3.4)                                         */
/* ================================================================== */

describe("Branding Settings (Phase 3.4)", () => {
  let token: string;

  beforeAll(async () => {
    const s = await setup("branding-test");
    token = s.token;
  });

  test("get branding", async () => {
    const res = await request(app).get("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.branding.name).toBe("branding-test Co");
    expect(res.body.data.slug).toBe("branding-test");
  });

  test("update branding with valid hex colors", async () => {
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Co", primaryColor: "#FF5733", surfaceColor: "#FFFFFF" });
    expect(res.status).toBe(200);
    expect(res.body.data.branding.name).toBe("Updated Co");
    expect(res.body.data.branding.primaryColor).toBe("#FF5733");
  });

  test("reject invalid hex color", async () => {
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${token}`)
      .send({ primaryColor: "not-a-color" });
    expect(res.status).toBe(400);
  });

  test("reject empty update", async () => {
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_changes");
  });

  test("update logo URL", async () => {
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${token}`)
      .send({ logoUrl: "https://cdn.example.com/logo.png" });
    expect(res.status).toBe(200);
    expect(res.body.data.branding.logoUrl).toBe("https://cdn.example.com/logo.png");
  });

  test("AGENT cannot update branding (no SETTINGS_UPDATE)", async () => {
    const tenant = await Tenant.findOne({ slug: "branding-test" });
    const agent = await User.create({
      tenantId: tenant!._id, firstName: "Ag", lastName: "T",
      email: "ag@brand.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["AGENT"], status: "ACTIVE",
    });
    const agentToken = signAccessToken({ sub: String(agent._id), tid: String(tenant!._id), roles: ["AGENT"] });
    const res = await request(app).put("/api/v1/settings/branding")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  6. Survey Response Analytics (3.5)                                 */
/* ================================================================== */

describe("Survey Analytics (Phase 3.5)", () => {
  let token: string, tid: string, surveyId: string;

  beforeAll(async () => {
    const s = await setup("survey-analytics");
    token = s.token; tid = s.tid;

    // Create survey
    const survey = await Survey.create({
      tenantId: s.tenant._id, key: "csat_test", name: "CSAT Test",
      isActive: true, questions: [{ key: "rating", label: "Rate us", type: "RATING", required: true }],
    });
    surveyId = String(survey._id);

    // Seed responses
    await SurveyResponse.insertMany([
      { tenantId: s.tenant._id, surveyId: survey._id, ticketId: s.user._id, customerEmail: "a@t.com", answers: [{ key: "rating", value: 9 }], overallScore: 9 },
      { tenantId: s.tenant._id, surveyId: survey._id, ticketId: s.user._id, customerEmail: "b@t.com", answers: [{ key: "rating", value: 10 }], overallScore: 10 },
      { tenantId: s.tenant._id, surveyId: survey._id, ticketId: s.user._id, customerEmail: "c@t.com", answers: [{ key: "rating", value: 5 }], overallScore: 5 },
      { tenantId: s.tenant._id, surveyId: survey._id, ticketId: s.user._id, customerEmail: "d@t.com", answers: [{ key: "rating", value: 8 }], overallScore: 8 },
    ]);
  });

  test("list survey responses with pagination", async () => {
    const res = await request(app).get(`/api/v1/surveys/${surveyId}/responses`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
  });

  test("paginate responses with limit", async () => {
    const res = await request(app).get(`/api/v1/surveys/${surveyId}/responses?limit=2`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.nextCursor).toBeTruthy();
  });

  test("get survey analytics with NPS", async () => {
    const res = await request(app).get(`/api/v1/surveys/${surveyId}/analytics`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalResponses).toBe(4);
    expect(res.body.data.avgScore).toBeGreaterThan(0);
    expect(res.body.data.minScore).toBe(5);
    expect(res.body.data.maxScore).toBe(10);
    // NPS: 2 promoters (9,10), 1 passive (8), 1 detractor (5) => (2-1)/4 * 100 = 25
    expect(res.body.data.nps).toBe(25);
  });

  test("analytics for survey with no responses", async () => {
    const empty = await Survey.create({
      tenantId: (await Tenant.findOne({ slug: "survey-analytics" }))!._id,
      key: "empty_survey", name: "Empty", isActive: true, questions: [],
    });
    const res = await request(app).get(`/api/v1/surveys/${empty._id}/analytics`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalResponses).toBe(0);
    expect(res.body.data.nps).toBeNull();
  });
});

/* ================================================================== */
/*  7. New Models Exist (3.0)                                          */
/* ================================================================== */

describe("PRD Data Models (Phase 3.0)", () => {
  test("Attachment model is registered", () => {
    const { Attachment } = require("../../models/Attachment");
    expect(Attachment.modelName).toBe("Attachment");
  });

  test("Invoice model is registered", () => {
    const { Invoice } = require("../../models/Invoice");
    expect(Invoice.modelName).toBe("Invoice");
  });

  test("ApiKey model is registered", () => {
    const { ApiKey } = require("../../models/ApiKey");
    expect(ApiKey.modelName).toBe("ApiKey");
  });

  test("Webhook model is registered", () => {
    const { Webhook } = require("../../models/Webhook");
    expect(Webhook.modelName).toBe("Webhook");
  });

  test("DomainEvent model is registered", () => {
    const { DomainEvent } = require("../../models/DomainEvent");
    expect(DomainEvent.modelName).toBe("DomainEvent");
  });
});
