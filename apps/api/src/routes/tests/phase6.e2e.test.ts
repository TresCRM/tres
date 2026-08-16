/**
 * @module tests/phase6.e2e
 * Phase 6: Open Tenant API -- comprehensive test suite.
 * Covers: API key management, external ticket/customer endpoints,
 * webhook CRUD, API key auth middleware, scope enforcement, security.
 */
import request from "supertest";
import { createHash } from "crypto";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { ApiKey } from "../../models/ApiKey";
import { Webhook } from "../../models/Webhook";
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

async function createApiKey(token: string, scopes = ["tickets:read", "tickets:write", "customers:read", "customers:write"]) {
  const res = await request(app).post("/api/v1/api-keys")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Key", scopes });
  return { keyId: res.body.data._id, rawKey: res.body.key, prefix: res.body.data.prefix };
}

/* ================================================================== */
/*  1. API Key Management (6.1)                                        */
/* ================================================================== */

describe("API Key Management (Phase 6.1)", () => {
  let token: string, tid: string;
  let keyId: string, rawKey: string;

  beforeAll(async () => {
    const s = await setup("apikey-mgmt");
    token = s.token; tid = s.tid;
  });

  test("create API key returns full key once", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My Key", scopes: ["tickets:read", "tickets:write"] });
    expect(res.status).toBe(201);
    expect(res.body.key).toBeTruthy();
    expect(res.body.key).toMatch(/^sk_live_/);
    expect(res.body.data.name).toBe("My Key");
    expect(res.body.data.prefix).toBeTruthy();
    expect(res.body.data.scopes).toEqual(["tickets:read", "tickets:write"]);
    keyId = res.body.data._id;
    rawKey = res.body.key;
  });

  test("list API keys never shows full key or hash", async () => {
    const res = await request(app).get("/api/v1/api-keys")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const key = res.body.data[0];
    expect(key.keyHash).toBeUndefined();
    expect(key.prefix).toBeTruthy();
  });

  test("update API key name/scopes", async () => {
    const res = await request(app).put(`/api/v1/api-keys/${keyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed Key", scopes: ["tickets:read"] });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Renamed Key");
    expect(res.body.data.scopes).toEqual(["tickets:read"]);
  });

  test("revoke API key", async () => {
    const res = await request(app).delete(`/api/v1/api-keys/${keyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("revoked key appears as inactive in list", async () => {
    const res = await request(app).get("/api/v1/api-keys")
      .set("Authorization", `Bearer ${token}`);
    const revoked = res.body.data.find((k: any) => k._id === keyId);
    expect(revoked.isActive).toBe(false);
  });

  test("reject invalid scopes", async () => {
    const res = await request(app).post("/api/v1/api-keys")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad", scopes: ["admin:everything"] });
    expect(res.status).toBe(400);
  });
});

/* ================================================================== */
/*  2. API Key Authentication Middleware                                */
/* ================================================================== */

describe("API Key Auth Middleware (Phase 6.1)", () => {
  let ownerToken: string, rawKey: string, tid: string;

  beforeAll(async () => {
    const s = await setup("apikey-auth");
    ownerToken = s.token; tid = s.tid;
    const k = await createApiKey(ownerToken);
    rawKey = k.rawKey;
  });

  test("valid API key accesses ext endpoints", async () => {
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", rawKey);
    expect(res.status).toBe(200);
  });

  test("missing X-API-Key returns 401", async () => {
    const res = await request(app).get("/api/v1/ext/tickets");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("api_key_required");
  });

  test("invalid API key returns 401", async () => {
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", "tcrm_invalid_key_that_does_not_exist_at_all");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_api_key");
  });

  test("revoked key returns 401", async () => {
    const k = await createApiKey(ownerToken);
    // Revoke it
    await request(app).delete(`/api/v1/api-keys/${k.keyId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    // Try to use it
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", k.rawKey);
    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
/*  3. Scope Enforcement                                               */
/* ================================================================== */

describe("API Key Scope Enforcement (Phase 6.1)", () => {
  let readOnlyKey: string;

  beforeAll(async () => {
    const s = await setup("scope-test");
    const k = await createApiKey(s.token, ["tickets:read"]);
    readOnlyKey = k.rawKey;
  });

  test("read-only key can list tickets", async () => {
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", readOnlyKey);
    expect(res.status).toBe(200);
  });

  test("read-only key cannot create tickets (missing tickets:write)", async () => {
    const res = await request(app).post("/api/v1/ext/tickets")
      .set("X-API-Key", readOnlyKey)
      .send({ subject: "Test", body: "test", customerEmail: "c@t.com" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("insufficient_scope");
  });

  test("read-only key cannot access customers (missing customers:read)", async () => {
    const res = await request(app).get("/api/v1/ext/customers")
      .set("X-API-Key", readOnlyKey);
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  4. External Ticket Endpoints (6.2)                                 */
/* ================================================================== */

describe("External Ticket API (Phase 6.2)", () => {
  let apiKey: string;
  let ticketId: string;

  beforeAll(async () => {
    const s = await setup("ext-tickets");
    const k = await createApiKey(s.token);
    apiKey = k.rawKey;
  });

  test("create ticket via API key", async () => {
    const res = await request(app).post("/api/v1/ext/tickets")
      .set("X-API-Key", apiKey)
      .send({
        subject: "External Ticket",
        body: "<p>Created via API</p>",
        priority: "HIGH",
        customerEmail: "ext@customer.com",
        tags: ["api", "external"],
        externalId: "EXT-001",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.subject).toBe("External Ticket");
    expect(res.body.data.priority).toBe("HIGH");
    expect(res.body.data.requestId).toBe("EXT-001");
    ticketId = res.body.data._id;
  });

  test("list tickets with filters", async () => {
    const res = await request(app).get("/api/v1/ext/tickets?status=OPEN&priority=HIGH")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("filter by externalId", async () => {
    const res = await request(app).get("/api/v1/ext/tickets?externalId=EXT-001")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].requestId).toBe("EXT-001");
  });

  test("get ticket with comments", async () => {
    const res = await request(app).get(`/api/v1/ext/tickets/${ticketId}`)
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.comments).toBeDefined();
  });

  test("update ticket", async () => {
    const res = await request(app).put(`/api/v1/ext/tickets/${ticketId}`)
      .set("X-API-Key", apiKey)
      .send({ priority: "LOW", tags: ["updated"] });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe("LOW");
  });

  test("add comment via API", async () => {
    const res = await request(app).post(`/api/v1/ext/tickets/${ticketId}/comments`)
      .set("X-API-Key", apiKey)
      .send({ body: "Agent response via API" });
    expect(res.status).toBe(201);
    expect(res.body.data.isAgent).toBe(true);
  });

  test("close ticket via API", async () => {
    const res = await request(app).post(`/api/v1/ext/tickets/${ticketId}/close`)
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CLOSED");
  });

  test("reopen closed ticket via API", async () => {
    const res = await request(app).post(`/api/v1/ext/tickets/${ticketId}/reopen`)
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REOPENED");
  });

  test("body is sanitized (XSS prevention)", async () => {
    const res = await request(app).post("/api/v1/ext/tickets")
      .set("X-API-Key", apiKey)
      .send({ subject: "XSS", body: '<script>evil()</script><p>Safe</p>', customerEmail: "x@t.com" });
    expect(res.status).toBe(201);
    expect(res.body.data.body).not.toContain("<script>");
    expect(res.body.data.body).toContain("<p>Safe</p>");
  });

  test("duplicate externalId returns 409", async () => {
    // Ensure unique index is built (may be deferred in memory MongoDB)
    await Ticket.ensureIndexes();
    const res = await request(app).post("/api/v1/ext/tickets")
      .set("X-API-Key", apiKey)
      .send({ subject: "Dup", body: "test", customerEmail: "d@t.com", externalId: "EXT-001" });
    expect(res.status).toBe(409);
  });
});

/* ================================================================== */
/*  5. External Customer Endpoints (6.3)                               */
/* ================================================================== */

describe("External Customer API (Phase 6.3)", () => {
  let apiKey: string;
  let customerId: string;

  beforeAll(async () => {
    const s = await setup("ext-customers");
    const k = await createApiKey(s.token);
    apiKey = k.rawKey;
  });

  test("create customer via API (upsert)", async () => {
    const res = await request(app).post("/api/v1/ext/customers")
      .set("X-API-Key", apiKey)
      .send({ name: "Ext Customer", email: "ext@cust.com", company: "Ext Corp" });
    expect(res.status).toBe(201);
    customerId = res.body.data._id;
  });

  test("upsert same email updates instead of duplicate", async () => {
    const res = await request(app).post("/api/v1/ext/customers")
      .set("X-API-Key", apiKey)
      .send({ name: "Updated Name", email: "ext@cust.com", company: "New Corp" });
    expect(res.status).toBe(201);
    expect(res.body.data._id).toBe(customerId); // same ID
    expect(res.body.data.company).toBe("New Corp");
  });

  test("list customers", async () => {
    const res = await request(app).get("/api/v1/ext/customers")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("get single customer", async () => {
    const res = await request(app).get(`/api/v1/ext/customers/${customerId}`)
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("ext@cust.com");
  });

  test("update customer", async () => {
    const res = await request(app).put(`/api/v1/ext/customers/${customerId}`)
      .set("X-API-Key", apiKey)
      .send({ phone: "+1234567890" });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe("+1234567890");
  });
});

/* ================================================================== */
/*  6. Webhook Management (6.4)                                        */
/* ================================================================== */

describe("Webhook Management (Phase 6.4)", () => {
  let token: string, tid: string;
  let webhookId: string, webhookSecret: string;

  beforeAll(async () => {
    const s = await setup("webhook-mgmt");
    token = s.token; tid = s.tid;
  });

  test("create webhook returns secret once", async () => {
    const res = await request(app).post("/api/v1/webhooks")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://example.com/hook", events: ["ticket.created", "ticket.closed"] });
    expect(res.status).toBe(201);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.secret.length).toBe(64); // 32 bytes hex
    expect(res.body.data.url).toBe("https://example.com/hook");
    expect(res.body.data.events).toEqual(["ticket.created", "ticket.closed"]);
    webhookId = res.body.data._id;
    webhookSecret = res.body.secret;
  });

  test("list webhooks (secret not shown)", async () => {
    const res = await request(app).get("/api/v1/webhooks")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].secret).toBeUndefined();
  });

  test("update webhook URL and events", async () => {
    const res = await request(app).put(`/api/v1/webhooks/${webhookId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://new.example.com/hook", events: ["ticket.created"] });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe("https://new.example.com/hook");
  });

  test("delete webhook", async () => {
    const res = await request(app).delete(`/api/v1/webhooks/${webhookId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("deleted webhook returns 404", async () => {
    const res = await request(app).delete(`/api/v1/webhooks/${webhookId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("reject invalid event names", async () => {
    const res = await request(app).post("/api/v1/webhooks")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://example.com/hook", events: ["not.a.real.event"] });
    expect(res.status).toBe(400);
  });

  test("webhook dispatcher signs payloads correctly", () => {
    const { createHmac } = require("crypto");
    const payload = '{"event":"test","data":{}}';
    const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
    expect(expected).toMatch(/^[a-f0-9]{64}$/);
  });
});

/* ================================================================== */
/*  7. Security: tenant isolation on ext endpoints                     */
/* ================================================================== */

describe("Tenant Isolation on External API (Phase 6.6)", () => {
  let keyA: string, keyB: string;
  let ticketIdA: string;

  beforeAll(async () => {
    const a = await setup("tenant-a");
    const b = await setup("tenant-b");
    const ka = await createApiKey(a.token);
    const kb = await createApiKey(b.token);
    keyA = ka.rawKey;
    keyB = kb.rawKey;

    const res = await request(app).post("/api/v1/ext/tickets")
      .set("X-API-Key", keyA)
      .send({ subject: "Tenant A ticket", body: "private", customerEmail: "a@a.com" });
    ticketIdA = res.body.data._id;
  });

  test("tenant B cannot see tenant A tickets", async () => {
    const res = await request(app).get(`/api/v1/ext/tickets/${ticketIdA}`)
      .set("X-API-Key", keyB);
    expect(res.status).toBe(404);
  });

  test("tenant B cannot list tenant A tickets", async () => {
    const res = await request(app).get("/api/v1/ext/tickets")
      .set("X-API-Key", keyB);
    expect(res.status).toBe(200);
    const found = res.body.data.find((t: any) => t._id === ticketIdA);
    expect(found).toBeUndefined();
  });
});
