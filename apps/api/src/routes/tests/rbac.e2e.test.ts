/**
 * @module tests/rbac.e2e
 * Phase 2 RBAC -- comprehensive test suite.
 * Covers: role hierarchy, permission matrix, requirePermission middleware,
 * CUSTOMER role (public ticket endpoints), and typed auth context.
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";
import {
  hasRole,
  hasPermission,
  hasAllPermissions,
  getPermissions,
  meetsHierarchy,
  isValidRole,
  ROLE_PERMISSIONS,
} from "../../../../../packages/types/src/roles";

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

async function createTenantAndUser(slug: string, roles: Role[], email?: string) {
  const tenant = await Tenant.create({
    slug,
    branding: { name: `${slug} Co` },
    plan: "COMPANY",
    seats: 10,
  });
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Test",
    lastName: "User",
    email: email || `${slug}@test.local`,
    passwordHash: await hashPassword("TestPass1"),
    roles,
    status: "ACTIVE",
  });
  const token = signAccessToken({
    sub: String(user._id),
    tid: String(tenant._id),
    roles,
  });
  return { tenant, user, token };
}

/* ================================================================== */
/*  1. Role Hierarchy Unit Tests                                       */
/* ================================================================== */

describe("Role Hierarchy (packages/types/roles)", () => {
  test("OWNER meets ADMIN requirement", () => {
    expect(meetsHierarchy("OWNER", "ADMIN")).toBe(true);
  });

  test("OWNER meets AGENT requirement", () => {
    expect(meetsHierarchy("OWNER", "AGENT")).toBe(true);
  });

  test("OWNER meets READONLY requirement", () => {
    expect(meetsHierarchy("OWNER", "READONLY")).toBe(true);
  });

  test("ADMIN meets AGENT requirement", () => {
    expect(meetsHierarchy("ADMIN", "AGENT")).toBe(true);
  });

  test("ADMIN does NOT meet OWNER requirement", () => {
    expect(meetsHierarchy("ADMIN", "OWNER")).toBe(false);
  });

  test("AGENT does NOT meet ADMIN requirement", () => {
    expect(meetsHierarchy("AGENT", "ADMIN")).toBe(false);
  });

  test("READONLY does NOT meet AGENT requirement", () => {
    expect(meetsHierarchy("READONLY", "AGENT")).toBe(false);
  });

  test("lateral roles (BILLING, INTEGRATION, CUSTOMER) have no hierarchy", () => {
    expect(meetsHierarchy("BILLING", "AGENT")).toBe(false);
    expect(meetsHierarchy("OWNER", "BILLING")).toBe(false);
    expect(meetsHierarchy("INTEGRATION", "READONLY")).toBe(false);
    expect(meetsHierarchy("CUSTOMER", "READONLY")).toBe(false);
  });
});

/* ================================================================== */
/*  2. hasRole with Hierarchy                                          */
/* ================================================================== */

describe("hasRole (hierarchy-aware)", () => {
  test("OWNER user passes AGENT check via hierarchy", () => {
    expect(hasRole(["OWNER"], "AGENT")).toBe(true);
  });

  test("AGENT user fails ADMIN check", () => {
    expect(hasRole(["AGENT"], "ADMIN")).toBe(false);
  });

  test("BILLING is checked by exact match, not hierarchy", () => {
    expect(hasRole(["OWNER"], "BILLING")).toBe(false);
    expect(hasRole(["BILLING"], "BILLING")).toBe(true);
  });

  test("user with multiple roles: AGENT + BILLING passes both checks", () => {
    expect(hasRole(["AGENT", "BILLING"], "AGENT")).toBe(true);
    expect(hasRole(["AGENT", "BILLING"], "BILLING")).toBe(true);
  });

  test("CUSTOMER is a lateral role", () => {
    expect(hasRole(["CUSTOMER"], "CUSTOMER")).toBe(true);
    expect(hasRole(["CUSTOMER"], "AGENT")).toBe(false);
    expect(hasRole(["OWNER"], "CUSTOMER")).toBe(false);
  });
});

/* ================================================================== */
/*  3. Permission Matrix                                               */
/* ================================================================== */

describe("Permission Matrix", () => {
  test("OWNER has all permissions including OWNERSHIP_TRANSFER", () => {
    expect(hasPermission(["OWNER"], "OWNERSHIP_TRANSFER")).toBe(true);
    expect(hasPermission(["OWNER"], "TICKET_CREATE")).toBe(true);
    expect(hasPermission(["OWNER"], "BILLING_MANAGE")).toBe(true);
    expect(hasPermission(["OWNER"], "ADMIN_PANEL_ACCESS")).toBe(true);
  });

  test("ADMIN has most permissions but NOT OWNERSHIP_TRANSFER or BILLING_MANAGE", () => {
    expect(hasPermission(["ADMIN"], "TICKET_CREATE")).toBe(true);
    expect(hasPermission(["ADMIN"], "USER_INVITE")).toBe(true);
    expect(hasPermission(["ADMIN"], "OWNERSHIP_TRANSFER")).toBe(false);
    expect(hasPermission(["ADMIN"], "BILLING_MANAGE")).toBe(false);
  });

  test("AGENT can manage tickets but not users or billing", () => {
    expect(hasPermission(["AGENT"], "TICKET_CREATE")).toBe(true);
    expect(hasPermission(["AGENT"], "TICKET_ASSIGN")).toBe(true);
    expect(hasPermission(["AGENT"], "COMMENT_CREATE")).toBe(true);
    expect(hasPermission(["AGENT"], "USER_INVITE")).toBe(false);
    expect(hasPermission(["AGENT"], "BILLING_READ")).toBe(false);
    expect(hasPermission(["AGENT"], "ADMIN_PANEL_ACCESS")).toBe(false);
  });

  test("BILLING can only manage billing, not tickets", () => {
    expect(hasPermission(["BILLING"], "BILLING_READ")).toBe(true);
    expect(hasPermission(["BILLING"], "BILLING_MANAGE")).toBe(true);
    expect(hasPermission(["BILLING"], "TICKET_CREATE")).toBe(false);
    expect(hasPermission(["BILLING"], "USER_INVITE")).toBe(false);
  });

  test("READONLY can read but not write", () => {
    expect(hasPermission(["READONLY"], "TICKET_READ")).toBe(true);
    expect(hasPermission(["READONLY"], "LOG_READ")).toBe(true);
    expect(hasPermission(["READONLY"], "BILLING_READ")).toBe(true);
    expect(hasPermission(["READONLY"], "TICKET_CREATE")).toBe(false);
    expect(hasPermission(["READONLY"], "TICKET_CLOSE")).toBe(false);
    expect(hasPermission(["READONLY"], "USER_INVITE")).toBe(false);
  });

  test("INTEGRATION can CRUD tickets and customers only", () => {
    expect(hasPermission(["INTEGRATION"], "TICKET_CREATE")).toBe(true);
    expect(hasPermission(["INTEGRATION"], "TICKET_READ")).toBe(true);
    expect(hasPermission(["INTEGRATION"], "CUSTOMER_CREATE")).toBe(true);
    expect(hasPermission(["INTEGRATION"], "USER_INVITE")).toBe(false);
    expect(hasPermission(["INTEGRATION"], "BILLING_READ")).toBe(false);
  });

  test("CUSTOMER can only create/read tickets and comments", () => {
    expect(hasPermission(["CUSTOMER"], "TICKET_CREATE")).toBe(true);
    expect(hasPermission(["CUSTOMER"], "TICKET_READ")).toBe(true);
    expect(hasPermission(["CUSTOMER"], "COMMENT_CREATE")).toBe(true);
    expect(hasPermission(["CUSTOMER"], "TICKET_CLOSE")).toBe(false);
    expect(hasPermission(["CUSTOMER"], "CUSTOMER_READ")).toBe(false);
  });

  test("hasAllPermissions checks all permissions are present", () => {
    expect(hasAllPermissions(["OWNER"], ["TICKET_CREATE", "BILLING_MANAGE"])).toBe(true);
    expect(hasAllPermissions(["AGENT"], ["TICKET_CREATE", "BILLING_MANAGE"])).toBe(false);
  });

  test("getPermissions returns union of all role permissions", () => {
    const perms = getPermissions(["AGENT", "BILLING"]);
    expect(perms.has("TICKET_CREATE")).toBe(true);
    expect(perms.has("BILLING_MANAGE")).toBe(true);
    expect(perms.has("USER_INVITE")).toBe(false);
  });
});

/* ================================================================== */
/*  4. isValidRole                                                     */
/* ================================================================== */

describe("isValidRole", () => {
  test("accepts valid roles", () => {
    expect(isValidRole("OWNER")).toBe(true);
    expect(isValidRole("ADMIN")).toBe(true);
    expect(isValidRole("CUSTOMER")).toBe(true);
  });

  test("rejects removed/invalid roles", () => {
    expect(isValidRole("SUPER")).toBe(false);
    expect(isValidRole("FAKE_ROLE")).toBe(false);
    expect(isValidRole("HACKER")).toBe(false);
    expect(isValidRole("")).toBe(false);
  });

  test("auth middleware strips invalid roles from JWT", async () => {
    const { tenant } = await createTenantAndUser("strip-roles", ["OWNER"]);
    // Sign a token with invalid roles mixed in
    const badToken = signAccessToken({
      sub: "fakeid",
      tid: String(tenant._id),
      roles: ["OWNER", "SUPER", "FAKE_ROLE", "HACKER"] as any,
    });
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(200);
    // Only valid roles should be in the payload
    expect(res.body.roles).toEqual(["OWNER"]);
    expect(res.body.roles).not.toContain("SUPER");
    expect(res.body.roles).not.toContain("FAKE_ROLE");
    expect(res.body.roles).not.toContain("HACKER");
  });
});

/* ================================================================== */
/*  5. Permission-Based Route Access (E2E)                             */
/* ================================================================== */

describe("Permission-based route access (E2E)", () => {
  let ownerToken: string;
  let agentToken: string;
  let readonlyToken: string;
  let billingToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const owner = await createTenantAndUser("rbac-e2e", ["OWNER"]);
    tenantId = String(owner.tenant._id);
    ownerToken = owner.token;
    await seedActiveSubscription(tenantId);

    // Create additional users with different roles in same tenant
    const agentUser = await User.create({
      tenantId: owner.tenant._id, firstName: "Agent", lastName: "A", email: "agent@rbac.local",
      passwordHash: await hashPassword("TestPass1"), roles: ["AGENT"], status: "ACTIVE",
    });
    agentToken = signAccessToken({ sub: String(agentUser._id), tid: tenantId, roles: ["AGENT"] });

    const roUser = await User.create({
      tenantId: owner.tenant._id, firstName: "RO", lastName: "A", email: "ro@rbac.local",
      passwordHash: await hashPassword("TestPass1"), roles: ["READONLY"], status: "ACTIVE",
    });
    readonlyToken = signAccessToken({ sub: String(roUser._id), tid: tenantId, roles: ["READONLY"] });

    const billUser = await User.create({
      tenantId: owner.tenant._id, firstName: "Bill", lastName: "A", email: "bill@rbac.local",
      passwordHash: await hashPassword("TestPass1"), roles: ["BILLING"], status: "ACTIVE",
    });
    billingToken = signAccessToken({ sub: String(billUser._id), tid: tenantId, roles: ["BILLING"] });
  });

  // --- Ticket creation: requires TICKET_CREATE ---

  test("OWNER can create tickets (hierarchy: OWNER > AGENT)", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ subject: "Owner Ticket", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(res.status).toBe(201);
  });

  test("AGENT can create tickets", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ subject: "Agent Ticket", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(res.status).toBe(201);
  });

  test("READONLY cannot create tickets", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .send({ subject: "RO Ticket", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(res.status).toBe(403);
  });

  test("BILLING cannot create tickets", async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${billingToken}`)
      .send({ subject: "Bill Ticket", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    expect(res.status).toBe(403);
  });

  // --- Ticket reading: all authenticated users can list ---

  test("READONLY can list tickets", async () => {
    const res = await request(app)
      .get("/api/v1/tickets")
      .set("Authorization", `Bearer ${readonlyToken}`);
    expect(res.status).toBe(200);
  });

  // --- Logs: requires LOG_READ ---

  test("OWNER can read logs", async () => {
    const res = await request(app)
      .get("/api/v1/logs/activity")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  test("READONLY can read logs (has LOG_READ)", async () => {
    const res = await request(app)
      .get("/api/v1/logs/activity")
      .set("Authorization", `Bearer ${readonlyToken}`);
    expect(res.status).toBe(200);
  });

  test("AGENT cannot read logs (no LOG_READ)", async () => {
    const res = await request(app)
      .get("/api/v1/logs/activity")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  // --- Subscriptions: requires BILLING_MANAGE ---

  test("BILLING can manage subscriptions", async () => {
    const res = await request(app)
      .get("/api/v1/subscriptions/me")
      .set("Authorization", `Bearer ${billingToken}`);
    expect(res.status).toBe(200);
  });

  test("AGENT cannot manage subscriptions", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/cancel")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  6. CUSTOMER Role -- Public Ticket Endpoints                        */
/* ================================================================== */

describe("CUSTOMER role -- Public ticket endpoints (Phase 2.4)", () => {
  const tenantSlug = "cust-role-test";
  let tenantId: string;
  let ticketId: string;
  let trackingToken: string;

  beforeAll(async () => {
    const { tenant } = await createTenantAndUser(tenantSlug, ["OWNER"]);
    tenantId = String(tenant._id);
  });

  test("POST /public/tickets creates a ticket and returns tracking URL", async () => {
    const res = await request(app).post("/public/tickets").send({
      subject: "I need help",
      body: "My login doesn't work",
      customerEmail: "customer@example.com",
      tenantSlug,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ticketId).toBeTruthy();
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.trackingUrl).toBeTruthy(); // exposed in test mode
    ticketId = res.body.data.ticketId;

    // Extract token from tracking URL
    const url = new URL(res.body.data.trackingUrl);
    trackingToken = url.searchParams.get("token")!;
    expect(trackingToken).toBeTruthy();
  });

  test("GET /public/tickets/:id with valid token returns ticket", async () => {
    const res = await request(app)
      .get(`/public/tickets/${ticketId}?token=${encodeURIComponent(trackingToken)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe("I need help");
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.comments).toBeDefined();
  });

  test("GET /public/tickets/:id with wrong token returns 403", async () => {
    // Create a token for a different email
    const jwt = require("jsonwebtoken");
    const wrongToken = jwt.sign(
      { email: "hacker@evil.com", tid: tenantId, type: "customer_access" },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get(`/public/tickets/${ticketId}?token=${encodeURIComponent(wrongToken)}`);
    expect(res.status).toBe(403);
  });

  test("GET /public/tickets/:id without token returns 401", async () => {
    const res = await request(app).get(`/public/tickets/${ticketId}`);
    expect(res.status).toBe(401);
  });

  test("POST /public/tickets/:id/reply adds a customer comment", async () => {
    const res = await request(app)
      .post(`/public/tickets/${ticketId}/reply?token=${encodeURIComponent(trackingToken)}`)
      .send({ body: "Thanks for the quick response!" });
    expect(res.status).toBe(201);
    expect(res.body.data.commentId).toBeTruthy();
  });

  test("customer reply is marked as non-agent", async () => {
    const res = await request(app)
      .get(`/public/tickets/${ticketId}?token=${encodeURIComponent(trackingToken)}`);
    expect(res.status).toBe(200);
    const customerComment = res.body.data.comments.find(
      (c: any) => c.body.includes("Thanks for the quick response")
    );
    expect(customerComment).toBeTruthy();
    expect(customerComment.isAgent).toBe(false);
  });

  test("POST /public/tickets with invalid tenant returns 404", async () => {
    const res = await request(app).post("/public/tickets").send({
      subject: "Test",
      body: "Test",
      customerEmail: "x@y.com",
      tenantSlug: "nonexistent-tenant",
    });
    expect(res.status).toBe(404);
  });

  test("POST /public/tickets sanitizes HTML in body", async () => {
    const res = await request(app).post("/public/tickets").send({
      subject: "XSS via public",
      body: '<p>Help</p><script>evil()</script>',
      customerEmail: "safe@example.com",
      tenantSlug,
    });
    expect(res.status).toBe(201);
    // Verify the stored ticket is sanitized
    const ticket = await Ticket.findById(res.body.data.ticketId).lean();
    expect(ticket!.body).not.toContain("<script>");
    expect(ticket!.body).toContain("<p>Help</p>");
  });

  test("POST /public/tickets/request-access always returns 200 (no enumeration)", async () => {
    // Valid request
    const res1 = await request(app).post("/public/tickets/request-access").send({
      email: "customer@example.com",
      ticketId,
      tenantSlug,
    });
    expect(res1.status).toBe(200);

    // Invalid email
    const res2 = await request(app).post("/public/tickets/request-access").send({
      email: "nobody@example.com",
      ticketId,
      tenantSlug,
    });
    expect(res2.status).toBe(200); // same response, no leak

    // Invalid tenant
    const res3 = await request(app).post("/public/tickets/request-access").send({
      email: "customer@example.com",
      ticketId,
      tenantSlug: "fake-slug",
    });
    expect(res3.status).toBe(200); // same response, no leak
  });
});

/* ================================================================== */
/*  7. Signup gives OWNER role only                                    */
/* ================================================================== */

describe("Signup assigns OWNER role only (not multiple)", () => {
  test("new signup user has only OWNER role", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({
      tenant: { name: "Role Check Co", slug: "role-check", plan: "INDIVIDUAL" },
      owner: { firstName: "A", lastName: "B", email: "rolecheck@test.local", password: "ValidPass1" },
    });
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: "rolecheck@test.local" }).lean();
    expect(user!.roles).toEqual(["OWNER"]);
  });
});
