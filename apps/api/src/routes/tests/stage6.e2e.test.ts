/**
 * Stage 6: Premium Experience & Enterprise Hardening -- E2E Tests
 * Covers: Microsoft OAuth, SSO config, video sessions, custom roles,
 * analytics, custom fields, audit export
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { Customer } from "../../models/Customer";
import { VideoSession } from "../../models/VideoSession";
import { CustomRole } from "../../models/CustomRole";
import { CustomFieldDefinition } from "../../models/CustomFieldDefinition";
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

/* ================================================================== */
/*  1. Microsoft OAuth                                                 */
/* ================================================================== */
describe("Microsoft OAuth (Stage 6.1)", () => {
  test("GET /oauth/microsoft/start returns 503 when not configured", async () => {
    const res = await request(app).get("/api/v1/oauth/microsoft/start");
    expect(res.status).toBe(503);
  });
});

/* ================================================================== */
/*  2. SSO Config on Tenant                                            */
/* ================================================================== */
describe("Tenant SSO Config (Stage 6.1)", () => {
  test("tenant supports ssoConfig", async () => {
    const tenant = await Tenant.create({
      slug: "sso-test", branding: { name: "SSO Co" }, plan: "COMPANY", seats: 5,
      ssoConfig: { provider: "saml", entityId: "tres-crm", ssoUrl: "https://idp.example.com/sso", ssoRequired: true },
    });
    expect(tenant.ssoConfig?.provider).toBe("saml");
    expect(tenant.ssoConfig?.ssoRequired).toBe(true);
  });
});

/* ================================================================== */
/*  3. Video Sessions                                                  */
/* ================================================================== */
describe("Video Sessions (Stage 6.2)", () => {
  let ownerToken: string, tid: string, uid: string;

  beforeAll(async () => {
    const s = await setup("video-test");
    ownerToken = s.token; tid = s.tid; uid = s.uid;
  });

  test("create video session", async () => {
    const res = await request(app).post("/api/v1/video/sessions")
      .set("Authorization", "Bearer " + ownerToken)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("INITIATED");
  });

  test("record consent", async () => {
    const create = await request(app).post("/api/v1/video/sessions")
      .set("Authorization", "Bearer " + ownerToken).send({});
    const id = create.body.data._id;
    const res = await request(app).put("/api/v1/video/sessions/" + id + "/consent")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.consentGiven).toBe(true);
  });

  test("start and end session", async () => {
    const create = await request(app).post("/api/v1/video/sessions")
      .set("Authorization", "Bearer " + ownerToken).send({});
    const id = create.body.data._id;

    const start = await request(app).put("/api/v1/video/sessions/" + id + "/start")
      .set("Authorization", "Bearer " + ownerToken);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe("ACTIVE");

    const end = await request(app).put("/api/v1/video/sessions/" + id + "/end")
      .set("Authorization", "Bearer " + ownerToken);
    expect(end.status).toBe(200);
    expect(end.body.data.status).toBe("ENDED");
    expect(end.body.data.duration).toBeDefined();
  });

  test("list video sessions", async () => {
    const res = await request(app).get("/api/v1/video/sessions")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================== */
/*  4. Custom RBAC Roles                                               */
/* ================================================================== */
describe("Custom Roles (Stage 6.3)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("roles-test");
    ownerToken = s.token;
  });

  test("create custom role", async () => {
    const res = await request(app).post("/api/v1/roles/custom")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Senior Agent", description: "Agent with extra perms", permissions: ["TICKET_CREATE", "TICKET_READ", "TICKET_UPDATE", "CUSTOMER_READ"] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Senior Agent");
    expect(res.body.data.permissions).toContain("TICKET_CREATE");
  });

  test("list custom roles", async () => {
    const res = await request(app).get("/api/v1/roles/custom")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("update custom role", async () => {
    const list = await request(app).get("/api/v1/roles/custom")
      .set("Authorization", "Bearer " + ownerToken);
    const id = list.body.data[0]._id;
    const res = await request(app).put("/api/v1/roles/custom/" + id)
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Lead Agent" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Lead Agent");
  });

  test("delete custom role (soft)", async () => {
    const list = await request(app).get("/api/v1/roles/custom")
      .set("Authorization", "Bearer " + ownerToken);
    const id = list.body.data[0]._id;
    const res = await request(app).delete("/api/v1/roles/custom/" + id)
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
  });
});

/* ================================================================== */
/*  5. Analytics Endpoints                                             */
/* ================================================================== */
describe("Analytics (Stage 6.4)", () => {
  let ownerToken: string, tid: string, uid: string;

  beforeAll(async () => {
    const s = await setup("analytics-test");
    ownerToken = s.token; tid = s.tid; uid = s.uid;
    // Seed some tickets
    await Ticket.create([
      { tenantId: tid, subject: "A1", body: "t", status: "OPEN", priority: "HIGH", createdBy: uid },
      { tenantId: tid, subject: "A2", body: "t", status: "CLOSED", priority: "LOW", createdBy: uid, assigneeId: uid },
      { tenantId: tid, subject: "A3", body: "t", status: "IN_PROGRESS", priority: "MEDIUM", createdBy: uid, assigneeId: uid },
    ]);
  });

  test("GET /analytics/tickets/summary", async () => {
    const res = await request(app).get("/api/v1/analytics/tickets/summary")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
  });

  test("GET /analytics/tickets/volume", async () => {
    const res = await request(app).get("/api/v1/analytics/tickets/volume")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("GET /analytics/tickets/sla", async () => {
    const res = await request(app).get("/api/v1/analytics/tickets/sla")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test("GET /analytics/agents/performance", async () => {
    const res = await request(app).get("/api/v1/analytics/agents/performance")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("GET /analytics/customers/intelligence", async () => {
    const res = await request(app).get("/api/v1/analytics/customers/intelligence")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

/* ================================================================== */
/*  6. Custom Fields                                                   */
/* ================================================================== */
describe("Custom Fields (Stage 6.5)", () => {
  let ownerToken: string, tid: string;

  beforeAll(async () => {
    const s = await setup("cfields-test");
    ownerToken = s.token; tid = s.tid;
  });

  test("create custom field definition", async () => {
    const res = await request(app).post("/api/v1/custom-fields")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ entityType: "TICKET", name: "order_number", label: "Order Number", type: "TEXT" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("order_number");
    expect(res.body.data.type).toBe("TEXT");
  });

  test("create dropdown field with options", async () => {
    const res = await request(app).post("/api/v1/custom-fields")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ entityType: "TICKET", name: "issue_category", label: "Issue Category", type: "DROPDOWN", options: ["billing", "technical", "general"] });
    expect(res.status).toBe(201);
    expect(res.body.data.options).toContain("billing");
  });

  test("list custom fields", async () => {
    const res = await request(app).get("/api/v1/custom-fields")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test("ticket supports customFields", async () => {
    const s = await setup("cfields-ticket");
    const ticket = await Ticket.create({
      tenantId: s.tid, subject: "Custom fields test", body: "test",
      status: "OPEN", createdBy: s.uid,
    });
    // Set custom fields via update to avoid Map type issues
    await Ticket.findByIdAndUpdate(ticket._id, {
      $set: { "customFields.order_number": "ORD-12345", "customFields.priority_level": 3 },
    });
    const found = await Ticket.findById(ticket._id).lean();
    expect(found!.customFields).toBeDefined();
    expect((found!.customFields as any).order_number).toBe("ORD-12345");
  });

  test("customer supports customFields", async () => {
    const s = await setup("cfields-cust");
    const customer = await Customer.create({
      tenantId: s.tid, name: "Custom Cust", email: "cf@test.local",
    });
    await Customer.findByIdAndUpdate(customer._id, {
      $set: { "customFields.company_size": "50-100" },
    });
    const found = await Customer.findById(customer._id).lean();
    expect(found!.customFields).toBeDefined();
  });
});

/* ================================================================== */
/*  7. VideoSession model                                              */
/* ================================================================== */
describe("VideoSession model (Stage 6.2)", () => {
  test("supports all fields", async () => {
    const s = await setup("vsmodel");
    const vs = await VideoSession.create({
      tenantId: s.tid, agentId: s.uid, status: "INITIATED",
      startedAt: new Date(), consentGiven: false, screenShareUsed: false,
    });
    expect(vs.status).toBe("INITIATED");
    expect(vs.consentGiven).toBe(false);
  });
});

/* ================================================================== */
/*  8. CustomRole model                                                */
/* ================================================================== */
describe("CustomRole model (Stage 6.3)", () => {
  test("supports permissions array", async () => {
    const s = await setup("crmodel");
    const role = await CustomRole.create({
      tenantId: s.tid, name: "Tester", permissions: ["TICKET_READ", "COMMENT_CREATE"],
      isActive: true, createdBy: s.uid,
    });
    expect(role.permissions).toContain("TICKET_READ");
    expect(role.isActive).toBe(true);
  });
});
