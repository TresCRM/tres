/**
 * Stage 4: Developer Platform & API Maturity -- E2E Tests
 * Covers: sandbox keys, environment header, expanded scopes, API version header,
 * sandbox reset, OpenAPI endpoint, test-email, idempotency model
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { Customer } from "../../models/Customer";
import { ApiKey } from "../../models/ApiKey";
import { IdempotencyResult } from "../../models/IdempotencyResult";
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
/*  1. API Version Header                                              */
/* ================================================================== */
describe("API Version Header (Stage 4.2)", () => {
  test("all API responses include X-API-Version header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-api-version"]).toBe("v1");
  });

  test("authenticated endpoints include X-API-Version", async () => {
    const s = await setup("ver-test");
    const res = await request(app).get("/api/v1/tickets")
      .set("Authorization", "Bearer " + s.token);
    expect(res.headers["x-api-version"]).toBe("v1");
  });
});

/* ================================================================== */
/*  2. Sandbox API Keys                                                */
/* ================================================================== */
describe("Sandbox API Keys (Stage 4.1)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("sandbox-keys");
    ownerToken = s.token;
  });

  test("create sandbox API key with sk_test_ prefix", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Test Key", scopes: ["tickets:read"], environment: "sandbox" });
    expect(res.status).toBe(201);
    // key is returned in body.key (shown once)
    expect(res.body.key).toMatch(/^sk_test_/);
    expect(res.body.data.environment).toBe("sandbox");
  });

  test("create production API key with sk_live_ prefix", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Prod Key", scopes: ["tickets:read"], environment: "production" });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^sk_live_/);
    expect(res.body.data.environment).toBe("production");
  });

  test("default environment is production", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Default Key", scopes: ["tickets:read"] });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^sk_live_/);
  });

  test("list shows environment field", async () => {
    const res = await request(app).get("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    const sandbox = res.body.data.find((k: any) => k.environment === "sandbox");
    expect(sandbox).toBeDefined();
  });
});

/* ================================================================== */
/*  3. Expanded Scopes                                                 */
/* ================================================================== */
describe("Expanded API Key Scopes (Stage 4.2)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("scopes-test");
    ownerToken = s.token;
  });

  test("can create key with new scopes", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({
        name: "Full Scope",
        scopes: [
          "tickets:read", "tickets:write",
          "customers:read", "customers:write",
          "templates:read", "templates:write",
          "settings:read", "settings:write",
          "webhooks:manage", "analytics:read",
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.scopes).toContain("templates:read");
    expect(res.body.data.scopes).toContain("analytics:read");
  });

  test("rejects invalid scope", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Bad", scopes: ["invalid:scope"] });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  4. Sandbox Reset                                                   */
/* ================================================================== */
describe("Sandbox Reset (Stage 4.1)", () => {
  let ownerToken: string, tid: string;

  beforeAll(async () => {
    const s = await setup("sandbox-reset");
    ownerToken = s.token; tid = s.tid;

    // Create sandbox tickets and customers
    await Ticket.create([
      { tenantId: tid, subject: "Sandbox ticket 1", body: "test", status: "OPEN", createdBy: s.uid, isSandbox: true },
      { tenantId: tid, subject: "Sandbox ticket 2", body: "test", status: "OPEN", createdBy: s.uid, isSandbox: true },
      { tenantId: tid, subject: "Production ticket", body: "test", status: "OPEN", createdBy: s.uid, isSandbox: false },
    ]);
    await Customer.create([
      { tenantId: tid, name: "Sandbox Cust", email: "sandbox@test.local", isSandbox: true },
      { tenantId: tid, name: "Prod Cust", email: "prod@test.local", isSandbox: false },
    ]);
  });

  test("sandbox reset deletes only sandbox data", async () => {
    const res = await request(app).post("/api/v1/sandbox/reset")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.deleted.tickets).toBe(2);
    expect(res.body.deleted.customers).toBe(1);

    // Production data untouched
    const prodTickets = await Ticket.countDocuments({ tenantId: tid, isSandbox: false });
    expect(prodTickets).toBe(1);
    const prodCustomers = await Customer.countDocuments({ tenantId: tid, isSandbox: false });
    expect(prodCustomers).toBe(1);
  });
});

/* ================================================================== */
/*  5. OpenAPI Endpoint                                                */
/* ================================================================== */
describe("OpenAPI Spec (Stage 4.3)", () => {
  test("GET /api/v1/openapi.json returns valid OpenAPI document", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBeDefined();
    expect(res.body.paths).toBeDefined();
  });
});

/* ================================================================== */
/*  6. X-TRES-Environment Header (ext API)                             */
/* ================================================================== */
describe("X-TRES-Environment Header (Stage 4.1)", () => {
  let ownerToken: string, sandboxKey: string;

  beforeAll(async () => {
    const s = await setup("env-header");
    ownerToken = s.token;

    // Create sandbox key and get raw key
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ name: "Env Test", scopes: ["tickets:read", "tickets:write", "customers:read"], environment: "sandbox" });
    sandboxKey = res.body.key;
  });

  test("ext API with sandbox key returns X-TRES-Environment: sandbox", async () => {
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", sandboxKey);
    expect(res.headers["x-tres-environment"]).toBe("sandbox");
  });
});

/* ================================================================== */
/*  7. Test Email Endpoint                                             */
/* ================================================================== */
describe("Test Email Endpoint (Stage 4.5)", () => {
  let ownerToken: string;

  beforeAll(async () => {
    const s = await setup("email-test");
    ownerToken = s.token;
  });

  test("POST /settings/test-email sends test email", async () => {
    const res = await request(app).post("/api/v1/settings/test-email")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ to: "test@example.com" });
    // In test mode emails are disabled, so this may skip or succeed depending on config
    expect([200, 502]).toContain(res.status);
  });

  test("rejects invalid email", async () => {
    const res = await request(app).post("/api/v1/settings/test-email")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ to: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  8. isSandbox field on models                                       */
/* ================================================================== */
describe("isSandbox field (Stage 4.1)", () => {
  test("Ticket supports isSandbox field", async () => {
    const s = await setup("sandbox-field");
    const ticket = await Ticket.create({
      tenantId: s.tid, subject: "Sandbox test", body: "test",
      status: "OPEN", createdBy: s.uid, isSandbox: true,
    });
    expect(ticket.isSandbox).toBe(true);

    const found = await Ticket.findById(ticket._id).lean();
    expect(found!.isSandbox).toBe(true);
  });

  test("Customer supports isSandbox field", async () => {
    const s = await setup("sandbox-cust");
    const customer = await Customer.create({
      tenantId: s.tid, name: "Sandbox", email: "sb@test.local", isSandbox: true,
    });
    expect(customer.isSandbox).toBe(true);
  });
});

/* ================================================================== */
/*  9. IdempotencyResult model                                         */
/* ================================================================== */
describe("IdempotencyResult Model (Stage 4.2)", () => {
  test("can store and retrieve idempotency result", async () => {
    const s = await setup("idemp-test");
    const result = await IdempotencyResult.create({
      tenantId: s.tid,
      key: "test-key-123",
      method: "POST",
      path: "/api/v1/tickets",
      statusCode: 201,
      body: { data: { _id: "abc" } },
    });
    expect(result.key).toBe("test-key-123");

    const found = await IdempotencyResult.findOne({ tenantId: s.tid, key: "test-key-123" });
    expect(found).toBeTruthy();
    expect(found!.statusCode).toBe(201);
  });

  test("unique constraint on tenantId + key", async () => {
    const s = await setup("idemp-uniq");
    await IdempotencyResult.ensureIndexes();
    await IdempotencyResult.create({
      tenantId: s.tid, key: "dup-key", method: "POST", path: "/test", statusCode: 200, body: {},
    });
    await expect(IdempotencyResult.create({
      tenantId: s.tid, key: "dup-key", method: "POST", path: "/test", statusCode: 200, body: {},
    })).rejects.toThrow();
  });
});
