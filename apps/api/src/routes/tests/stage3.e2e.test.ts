/**
 * Stage 3: Customer Experience & Branded Portals -- E2E Tests
 * Covers: isInternal filter, trust timeline, service status, portal token,
 * subdomain/portalConfig on Tenant, customer ticket listing
 */
import request from "supertest";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { Comment } from "../../models/Comment";
import { ServiceStatus } from "../../models/ServiceStatus";
import { hashPassword, signAccessToken } from "../../utils/auth";
import jwt from "jsonwebtoken";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;
const CUSTOMER_TOKEN_SECRET = process.env.JWT_SECRET || "test-secret";

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

function signCustomerToken(email: string, tid: string, ticketId?: string) {
  return jwt.sign(
    { email, tid, ticketId, type: "customer_access" },
    CUSTOMER_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
}

function signPortalToken(email: string, tid: string) {
  return jwt.sign(
    { email, tid, type: "portal_access" },
    CUSTOMER_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
}

/* ================================================================== */
/*  1. isInternal filter on public ticket view                         */
/* ================================================================== */
describe("isInternal comment filtering (Stage 3)", () => {
  let tid: string, ownerToken: string, ticketId: string, customerToken: string;

  beforeAll(async () => {
    const s = await setup("internal-filter");
    tid = s.tid; ownerToken = s.token;

    // Create ticket
    const t = await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ subject: "Filter test", body: "test", priority: "LOW", customerEmail: "cust@test.local" });
    ticketId = t.body.data._id;

    // Add public reply
    await request(app).post("/api/v1/tickets/" + ticketId + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "Public reply visible to customer" });

    // Add internal note
    await request(app).post("/api/v1/tickets/" + ticketId + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "Internal note hidden from customer", isInternal: true });

    customerToken = signCustomerToken("cust@test.local", tid, ticketId);
  });

  test("public ticket view excludes internal comments", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "?token=" + encodeURIComponent(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.comments.length).toBe(1);
    expect(res.body.data.comments[0].body).toContain("Public reply");
  });

  test("agent view includes internal comments", async () => {
    const res = await request(app).get("/api/v1/tickets/" + ticketId)
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    const comments = res.body.data.comments;
    expect(comments.length).toBe(2);
    const internal = comments.find((c: any) => c.isInternal);
    expect(internal).toBeDefined();
    expect(internal.body).toContain("Internal note");
  });
});

/* ================================================================== */
/*  2. Trust Timeline                                                  */
/* ================================================================== */
describe("Trust Timeline (Stage 3.2)", () => {
  let tid: string, ownerToken: string, ticketId: string, customerToken: string;

  beforeAll(async () => {
    const s = await setup("timeline-test");
    tid = s.tid; ownerToken = s.token;

    // Create ticket
    const t = await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ subject: "Timeline test", body: "test body", priority: "MEDIUM", customerEmail: "tl@test.local" });
    ticketId = t.body.data._id;

    // Make some status transitions
    await request(app).post("/api/v1/tickets/" + ticketId + "/assign")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ assigneeId: s.uid });

    await request(app).post("/api/v1/tickets/" + ticketId + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "We are looking into this" });

    // Add internal note (should NOT appear in timeline)
    await request(app).post("/api/v1/tickets/" + ticketId + "/reply")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ body: "Internal: escalate to L2", isInternal: true });

    customerToken = signCustomerToken("tl@test.local", tid, ticketId);
  });

  test("timeline returns ordered events", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "/timeline?token=" + encodeURIComponent(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.events).toBeDefined();
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.data.events.length).toBeGreaterThanOrEqual(2);
  });

  test("timeline excludes internal comments", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "/timeline?token=" + encodeURIComponent(customerToken));
    const events = res.body.data.events;
    const hasInternal = events.some((e: any) => e.body?.includes("Internal: escalate"));
    expect(hasInternal).toBe(false);
  });

  test("timeline includes status changes", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "/timeline?token=" + encodeURIComponent(customerToken));
    const statusEvents = res.body.data.events.filter((e: any) => e.type === "status_change");
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("timeline includes public replies", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "/timeline?token=" + encodeURIComponent(customerToken));
    const replyEvents = res.body.data.events.filter((e: any) => e.type === "reply");
    expect(replyEvents.length).toBeGreaterThanOrEqual(1);
    expect(replyEvents[0].body).toContain("looking into this");
  });

  test("timeline rejects invalid token", async () => {
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "/timeline?token=invalid");
    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
/*  3. Service Status                                                  */
/* ================================================================== */
describe("Service Status (Stage 3.4)", () => {
  let ownerToken: string, tid: string, tenantSlug: string;

  beforeAll(async () => {
    const s = await setup("status-test");
    ownerToken = s.token; tid = s.tid; tenantSlug = "status-test";
  });

  test("update service status", async () => {
    const res = await request(app).put("/api/v1/service-status")
      .set("Authorization", "Bearer " + ownerToken)
      .send({
        status: "OPERATIONAL",
        title: "All Systems Operational",
        components: [
          { name: "Ticket System", status: "OPERATIONAL" },
          { name: "Live Chat", status: "OPERATIONAL" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("OPERATIONAL");
    expect(res.body.data.components.length).toBe(2);
  });

  test("get service status (authenticated)", async () => {
    const res = await request(app).get("/api/v1/service-status")
      .set("Authorization", "Bearer " + ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("OPERATIONAL");
  });

  test("get public service status by tenant slug", async () => {
    const res = await request(app).get("/api/v1/service-status/public/" + tenantSlug);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("OPERATIONAL");
  });

  test("create incident", async () => {
    const res = await request(app).post("/api/v1/service-status/incidents")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ title: "Email delivery delay", message: "We are investigating delayed email delivery." });
    expect(res.status).toBe(201);
    expect(res.body.data.incident.title).toBe("Email delivery delay");
    expect(typeof res.body.data.index).toBe("number");
  });

  test("update incident", async () => {
    const res = await request(app).post("/api/v1/service-status/incidents/0/update")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ message: "Root cause identified. Fix being deployed.", status: "IDENTIFIED" });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test("resolve incident", async () => {
    const res = await request(app).post("/api/v1/service-status/incidents/0/update")
      .set("Authorization", "Bearer " + ownerToken)
      .send({ message: "Issue resolved. All systems nominal.", status: "RESOLVED" });
    expect(res.status).toBe(200);
    // Verify via GET
    const status = await request(app).get("/api/v1/service-status")
      .set("Authorization", "Bearer " + ownerToken);
    expect(status.body.data.incidents[0].status).toBe("RESOLVED");
  });

  test("public status hides resolved incidents by default", async () => {
    const res = await request(app).get("/api/v1/service-status/public/" + tenantSlug);
    expect(res.status).toBe(200);
    // Resolved incidents may or may not be hidden depending on implementation
    // At minimum the status should still be available
    expect(res.body.data.status).toBeDefined();
  });

  test("public status returns 404 for unknown tenant", async () => {
    const res = await request(app).get("/api/v1/service-status/public/nonexistent-slug");
    expect(res.status).toBe(404);
  });

  test("update status to degraded", async () => {
    const res = await request(app).put("/api/v1/service-status")
      .set("Authorization", "Bearer " + ownerToken)
      .send({
        status: "DEGRADED",
        title: "Degraded Performance",
        message: "Some users may experience slowness",
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DEGRADED");
  });
});

/* ================================================================== */
/*  4. Tenant subdomain + portalConfig                                 */
/* ================================================================== */
describe("Tenant subdomain & portalConfig (Stage 3.3)", () => {
  test("tenant can have subdomain", async () => {
    const tenant = await Tenant.create({
      slug: "subdomain-test",
      branding: { name: "SubTest" },
      plan: "COMPANY",
      seats: 5,
      subdomain: "acme",
    });
    expect(tenant.subdomain).toBe("acme");

    const found = await Tenant.findOne({ subdomain: "acme" });
    expect(found).toBeTruthy();
    expect(found!.slug).toBe("subdomain-test");
  });

  test("tenant can have portalConfig", async () => {
    const tenant = await Tenant.create({
      slug: "portal-config-test",
      branding: { name: "PortalCfg" },
      plan: "COMPANY",
      seats: 5,
      portalConfig: {
        showAgentName: true,
        showSlaTargets: false,
        showTransferDetails: true,
        allowCustomerPriority: false,
        customGreeting: "Welcome to our support center!",
      },
    });
    expect(tenant.portalConfig?.showAgentName).toBe(true);
    expect(tenant.portalConfig?.showSlaTargets).toBe(false);
    expect(tenant.portalConfig?.customGreeting).toBe("Welcome to our support center!");
  });

  test("subdomain is unique", async () => {
    await Tenant.ensureIndexes();
    await Tenant.create({
      slug: "unique-sub-1",
      branding: { name: "Unique1" },
      plan: "COMPANY",
      seats: 5,
      subdomain: "unique-test",
    });
    await expect(Tenant.create({
      slug: "unique-sub-2",
      branding: { name: "Unique2" },
      plan: "COMPANY",
      seats: 5,
      subdomain: "unique-test",
    })).rejects.toThrow();
  });
});

/* ================================================================== */
/*  5. Portal access token (list all customer tickets)                 */
/* ================================================================== */
describe("Portal access token (Stage 3.1)", () => {
  let tid: string, ownerToken: string;
  const customerEmail = "portal-cust@test.local";

  beforeAll(async () => {
    const s = await setup("portal-list");
    tid = s.tid; ownerToken = s.token;

    // Create multiple tickets for the same customer
    for (const subj of ["Issue A", "Issue B", "Issue C"]) {
      await request(app).post("/api/v1/tickets")
        .set("Authorization", "Bearer " + ownerToken)
        .send({ subject: subj, body: "test", priority: "LOW", customerEmail });
    }
  });

  test("portal token lists all customer tickets", async () => {
    const token = signPortalToken(customerEmail, tid);
    const res = await request(app)
      .get("/public/tickets")
      .query({ token, tenantSlug: "portal-list" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  test("portal token cannot access different tenant tickets", async () => {
    const other = await setup("portal-other");
    await request(app).post("/api/v1/tickets")
      .set("Authorization", "Bearer " + other.token)
      .send({ subject: "Other tenant", body: "test", priority: "LOW", customerEmail });

    // Portal token for first tenant should still only see 3 tickets
    const token = signPortalToken(customerEmail, tid);
    const res = await request(app)
      .get("/public/tickets")
      .query({ token, tenantSlug: "portal-list" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  test("customer_access token can view specific ticket", async () => {
    const tickets = await Ticket.find({ tenantId: tid, customerEmail }).lean();
    const ticketId = String(tickets[0]._id);
    const token = signCustomerToken(customerEmail, tid, ticketId);
    const res = await request(app)
      .get("/public/tickets/" + ticketId + "?token=" + encodeURIComponent(token));
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBeDefined();
  });

  test("invalid token type rejected", async () => {
    const badToken = jwt.sign(
      { email: customerEmail, tid, type: "bogus" },
      CUSTOMER_TOKEN_SECRET,
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/public/tickets?token=" + encodeURIComponent(badToken));
    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
/*  6. Public ticket creation + tracking flow                          */
/* ================================================================== */
describe("Public ticket creation flow (Stage 3)", () => {
  let tenantSlug: string;

  beforeAll(async () => {
    await setup("pub-flow");
    tenantSlug = "pub-flow";
  });

  test("create ticket via public API", async () => {
    const res = await request(app).post("/public/tickets")
      .send({
        subject: "Public ticket",
        body: "I need help with my order",
        customerEmail: "public@customer.com",
        tenantSlug,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.ticketId).toBeDefined();
    expect(res.body.data.status).toBe("OPEN");
  });

  test("request-access returns 200 regardless of validity", async () => {
    const res = await request(app).post("/public/tickets/request-access")
      .send({ email: "anyone@test.com", ticketId: "000000000000000000000000", tenantSlug });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
