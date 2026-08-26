/**
 * @module tests/hardening.widget-security
 * Regression tests for HARDENINGS.md sections 4 and 5 (public/widget exposure).
 *
 * Two properties, both previously unenforced:
 *  - internal agent notes must never reach the customer-facing widget
 *  - a widget token with no configured domains must not accept every origin
 */
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { WidgetToken } from "../../models/WidgetToken";
import { Ticket } from "../../models/Ticket";
import { Comment } from "../../models/Comment";
import { ENV } from "../../config/env";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

let slugCounter = 0;

async function setupTenant(roles: Role[] = ["OWNER"]) {
  const slug = `wsec-${slugCounter++}`;
  const tenant = await Tenant.create({
    slug,
    branding: { name: `${slug} Co` },
    plan: "COMPANY",
    seats: 5,
  });
  const user = await User.create({
    tenantId: tenant._id,
    firstName: "Test",
    lastName: "User",
    email: `${slug}@test.local`,
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

/* ------------------------------------------------------------------ */
/*  Internal comments must not leak through the widget                 */
/* ------------------------------------------------------------------ */

describe("widget ticket view — internal comments", () => {
  let ticketId: string;
  let trackingToken: string;
  let agentId: any;
  let tenantId: any;

  beforeAll(async () => {
    const s = await setupTenant();
    agentId = s.user._id;
    tenantId = s.tenant._id;

    const tokenRes = await request(app)
      .post("/api/v1/settings/widget-token")
      .set("Authorization", `Bearer ${s.token}`);
    const widgetToken = tokenRes.body.data.token;

    const created = await request(app).post("/public/widget/tickets").send({
      widgetToken,
      name: "Widget User",
      email: "widget-sec@customer.test",
      subject: "Printer is broken",
      body: "It will not print",
    });
    ticketId = created.body.data.ticketId;
    trackingToken = created.body.trackingToken;

    await Comment.create({
      tenantId,
      ticketId,
      authorId: agentId,
      body: "Public reply the customer should see",
      isAgent: true,
      isInternal: false,
    });
    await Comment.create({
      tenantId,
      ticketId,
      authorId: agentId,
      body: "INTERNAL ONLY: customer is on the churn list, do not escalate",
      isAgent: true,
      isInternal: true,
    });
  });

  async function fetchWidgetTicket() {
    return request(app).get(
      `/public/widget/tickets/${ticketId}?trackingToken=${encodeURIComponent(trackingToken)}`
    );
  }

  test("the customer-visible reply is returned", async () => {
    const res = await fetchWidgetTicket();

    expect(res.status).toBe(200);
    const bodies = res.body.data.comments.map((c: any) => c.body);
    expect(bodies).toContain("Public reply the customer should see");
  });

  test("the internal note is not returned", async () => {
    const res = await fetchWidgetTicket();

    const bodies = res.body.data.comments.map((c: any) => c.body);
    expect(bodies).not.toContain(
      "INTERNAL ONLY: customer is on the churn list, do not escalate"
    );
  });

  test("no internal text appears anywhere in the response payload", async () => {
    const res = await fetchWidgetTicket();

    expect(JSON.stringify(res.body)).not.toContain("INTERNAL ONLY");
  });

  test("comments with isInternal unset are still visible", async () => {
    await Comment.create({
      tenantId,
      ticketId,
      authorId: agentId,
      body: "Legacy comment with no isInternal flag",
      isAgent: true,
    });

    const res = await fetchWidgetTicket();
    const bodies = res.body.data.comments.map((c: any) => c.body);
    expect(bodies).toContain("Legacy comment with no isInternal flag");
  });
});

/* ------------------------------------------------------------------ */
/*  Widget token origin allowlist must fail closed                     */
/* ------------------------------------------------------------------ */

describe("widget token origin allowlist", () => {
  // Domain checks are skipped under ENV.IS_TEST, so flip it off to exercise them.
  const savedIsTest = (ENV as any).IS_TEST;

  beforeEach(() => {
    (ENV as any).IS_TEST = false;
  });
  afterEach(() => {
    (ENV as any).IS_TEST = savedIsTest;
  });

  async function makeWidgetToken(allowedDomains: string[]) {
    const { tenant, user } = await setupTenant();
    const wt = await WidgetToken.create({
      tenantId: tenant._id,
      token: `pub_${Math.random().toString(36).slice(2)}${slugCounter++}`,
      allowedDomains,
      isActive: true,
      createdBy: user._id,
    });
    return wt.token;
  }

  function getConfig(token: string, origin?: string) {
    const req = request(app).get(`/public/widget/config?token=${token}`);
    return origin ? req.set("Origin", origin) : req;
  }

  test("a token with no configured domains is rejected", async () => {
    const token = await makeWidgetToken([]);

    const res = await getConfig(token, "https://anything.example");

    expect(res.status).not.toBe(200);
  });

  test("a token with no configured domains is rejected even without an Origin", async () => {
    const token = await makeWidgetToken([]);

    const res = await getConfig(token);

    expect(res.status).not.toBe(200);
  });

  test("an allowed origin is accepted", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token, "https://mysite.com");

    expect(res.status).toBe(200);
  });

  test("a subdomain of an allowed origin is accepted", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token, "https://app.mysite.com");

    expect(res.status).toBe(200);
  });

  test("a lookalike suffix domain is rejected", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token, "https://mysite.com.evil.example");

    expect(res.status).not.toBe(200);
  });

  test("an unrelated origin is rejected", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token, "https://evil.example");

    expect(res.status).not.toBe(200);
  });

  test("a request with no Origin header is rejected when domains are configured", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token);

    expect(res.status).not.toBe(200);
  });

  test("a malformed Origin header is rejected", async () => {
    const token = await makeWidgetToken(["https://mysite.com"]);

    const res = await getConfig(token, "not a url");

    expect(res.status).not.toBe(200);
  });
});
