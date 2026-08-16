/**
 * e2e tests for the customer-email touchpoints of the ticketing system:
 *   - POST /api/v1/tickets/:id/resend-invite  (tenant triggers a fresh magic-link resend)
 *   - POST /api/v1/tickets                    (tenant-created ticket with customerEmail → email)
 *   - POST /public/tickets/request-portal-access (portal login sends magic link)
 *   - POST /public/tickets                    (portal create sends confirmation)
 *
 * These cover the regression where SMTP_PROVIDER=trescrm was set but customers
 * never received the invite email.
 */
import request from "supertest";
import jwt from "jsonwebtoken";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { Tenant } from "../../models/Tenant";
import { User } from "../../models/User";
import { Ticket } from "../../models/Ticket";
import { hashPassword } from "../../utils/auth";
import * as mailerModule from "../../services/mailer";
import { ENV } from "../../config/env";

let app: any;
let tenantId: string;
let userId: string;
let adminToken: string;

beforeAll(async () => {
  app = await testSetup();

  const tenant = await Tenant.create({
    slug: "acme",
    plan: "COMPANY",
    seats: 20,
    branding: { name: "Acme Support" },
    isActive: true,
  });
  tenantId = String(tenant._id);

  const admin = await User.create({
    tenantId: tenant._id,
    firstName: "Admin",
    lastName: "User",
    email: "admin@acme.test",
    passwordHash: await hashPassword("irrelevant"),
    roles: ["ADMIN"],
    status: "ACTIVE",
  });
  userId = String(admin._id);
  adminToken = jwt.sign(
    { sub: userId, tid: tenantId, roles: ["ADMIN"] },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );

  await seedActiveSubscription(tenantId);
});

afterAll(async () => {
  await testTeardown();
});

// Route handlers short-circuit when ENV.EMAILS_DISABLED is true. Flip it OFF so the
// code path that calls sendEmail actually runs; then we can spy on sendEmail and
// assert recipient + URL. The mailer's own DISABLED constant (from NODE_ENV=test)
// still keeps real SMTP traffic from going out, so spies are safe.
const ORIGINAL_EMAILS_DISABLED = ENV.EMAILS_DISABLED;

function enableEmailsForSpying() {
  (ENV as any).EMAILS_DISABLED = false;
}

function restoreEmailsDisabled() {
  (ENV as any).EMAILS_DISABLED = ORIGINAL_EMAILS_DISABLED;
}

describe("POST /api/v1/tickets/:id/resend-invite", () => {
  beforeEach(() => enableEmailsForSpying());
  afterEach(() => {
    restoreEmailsDisabled();
    jest.restoreAllMocks();
  });

  test("sends a fresh magic-link email when ticket has a customer email", async () => {
    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-1" } as any);

    const ticket = await Ticket.create({
      tenantId,
      subject: "Printer not working",
      body: "It prints garbled text",
      status: "OPEN",
      priority: "MEDIUM",
      customerEmail: "customer@example.com",
      createdBy: userId,
    });

    const res = await request(app)
      .post(`/api/v1/tickets/${ticket._id}/resend-invite`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.sentTo).toBe("customer@example.com");

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    expect(call.to).toBe("customer@example.com");
    expect(call.subject).toMatch(/tracking link/i);
    expect(call.html).toMatch(new RegExp(`/portal/tickets/${ticket._id}\\?token=`));
    expect(call.html).toMatch(/View Ticket/);
  });

  test("returns 400 when the ticket has no customer email on file", async () => {
    const ticket = await Ticket.create({
      tenantId,
      subject: "Internal-only ticket",
      body: "No customer attached",
      status: "OPEN",
      priority: "LOW",
      createdBy: userId,
    });

    await request(app)
      .post(`/api/v1/tickets/${ticket._id}/resend-invite`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  test("returns 404 when the ticket belongs to another tenant", async () => {
    const otherTenant = await Tenant.create({
      slug: "other",
      plan: "COMPANY",
      seats: 20,
      branding: { name: "Other" },
      isActive: true,
    });
    const foreignTicket = await Ticket.create({
      tenantId: otherTenant._id,
      subject: "Foreign",
      body: "x",
      status: "OPEN",
      priority: "MEDIUM",
      customerEmail: "foreign@example.com",
      createdBy: userId,
    });

    await request(app)
      .post(`/api/v1/tickets/${foreignTicket._id}/resend-invite`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(404);
  });
});

describe("POST /api/v1/tickets (tenant create) with customerEmail", () => {
  beforeEach(() => enableEmailsForSpying());
  afterEach(() => {
    restoreEmailsDisabled();
    jest.restoreAllMocks();
  });

  test("emails the customer a portal magic link pointing at /portal/tickets/:id", async () => {
    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-2" } as any);

    const res = await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        subject: "Cannot log in",
        body: "I'm locked out",
        priority: "HIGH",
        customerEmail: "helpme@example.com",
      })
      .expect(201);

    const ticketId = res.body.data._id;
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    expect(call.to).toBe("helpme@example.com");
    expect(call.html).toMatch(new RegExp(`/portal/tickets/${ticketId}\\?token=`));
  });

  test("does NOT email when no customerEmail is provided", async () => {
    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-3" } as any);

    await request(app)
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        subject: "Internal-only",
        body: "no customer",
        priority: "LOW",
      })
      .expect(201);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Public portal endpoints (mounted at /public/*)", () => {
  beforeEach(() => enableEmailsForSpying());
  afterEach(() => {
    restoreEmailsDisabled();
    jest.restoreAllMocks();
  });

  test("POST /public/tickets creates a ticket and emails confirmation with portal URL", async () => {
    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-4" } as any);

    const res = await request(app)
      .post("/public/tickets")
      .send({
        subject: "From the website",
        body: "Please help",
        customerEmail: "portal.user@example.com",
        tenantSlug: "acme",
      })
      .expect(201);

    expect(res.body.data.ticketId).toBeTruthy();
    expect(res.body.data.accessToken).toBeTruthy();

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    expect(call.to).toBe("portal.user@example.com");
    expect(call.html).toMatch(new RegExp(`/portal/tickets/${res.body.data.ticketId}\\?token=`));
  });

  test("POST /public/tickets/request-portal-access emails when a matching ticket exists", async () => {
    // Seed a ticket so the enumeration guard allows the email.
    await Ticket.create({
      tenantId,
      subject: "Previous ticket",
      body: "prior",
      status: "OPEN",
      priority: "MEDIUM",
      customerEmail: "magic.link@example.com",
      createdBy: userId,
    });

    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-5" } as any);

    await request(app)
      .post("/public/tickets/request-portal-access")
      .send({ email: "magic.link@example.com", tenantSlug: "acme" })
      .expect(200);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].to).toBe("magic.link@example.com");
    expect(spy.mock.calls[0][0].html).toMatch(/\/portal\?token=/);
  });

  test("POST /public/tickets/request-portal-access is silent when no ticket matches (enumeration guard)", async () => {
    const spy = jest.spyOn(mailerModule, "sendEmail").mockResolvedValue({ id: "msg-6" } as any);

    await request(app)
      .post("/public/tickets/request-portal-access")
      .send({ email: "stranger@example.com", tenantSlug: "acme" })
      .expect(200);

    // No ticket on file → do not leak by sending.
    expect(spy).not.toHaveBeenCalled();
  });

  test("GET /public/tickets/:id returns ticket + attachments with a valid magic-link token", async () => {
    const customerEmail = "viewer@example.com";
    const ticket = await Ticket.create({
      tenantId,
      subject: "Visible via token",
      body: "<p>hello</p>",
      status: "OPEN",
      priority: "MEDIUM",
      customerEmail,
      createdBy: userId,
    });

    const token = jwt.sign(
      { email: customerEmail, tid: tenantId, ticketId: String(ticket._id), type: "customer_access" },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get(`/public/tickets/${ticket._id}`)
      .query({ token })
      .expect(200);

    expect(res.body.data.subject).toBe("Visible via token");
    expect(Array.isArray(res.body.data.attachments)).toBe(true);
  });
});
