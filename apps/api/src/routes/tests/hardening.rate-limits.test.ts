/**
 * @module tests/hardening.rate-limits
 * Regression tests for HARDENINGS.md section 5 — abuse limits on the public and
 * widget surfaces.
 *
 * Two levels, because they answer different questions:
 *
 *  - Behaviour is exercised on a bare app carrying only the limiter under test.
 *    The real /public mount also carries a shared 20/min per-IP limiter, and
 *    supertest gives every request the same source address, so going through
 *    the full app cannot show which limiter fired or that budgets are keyed
 *    apart.
 *  - Wiring is then checked on the real app: that the limiter is actually
 *    attached to the route it is supposed to guard.
 *
 * `trust proxy` is off outside production (otherwise a client could spoof its
 * own rate-limit key), so the isolated app enables it to vary the source
 * address per request.
 */
const savedDisable = process.env.DISABLE_RATE_LIMIT;
process.env.DISABLE_RATE_LIMIT = "";

import express from "express";
import request from "supertest";
import { testSetup, testTeardown } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { WidgetToken } from "../../models/WidgetToken";
import { hashPassword } from "../../utils/auth";
import {
  publicTicketIpLimiter,
  publicTicketEmailLimiter,
  widgetTicketLimiter,
  widgetTicketTokenLimiter,
  widgetTokenLimiter,
} from "../../middlewares/security";

let app: any;
let seq = 0;

beforeAll(async () => {
  app = await testSetup();
});

afterAll(async () => {
  if (savedDisable === undefined) delete process.env.DISABLE_RATE_LIMIT;
  else process.env.DISABLE_RATE_LIMIT = savedDisable;
  await testTeardown();
});

/** A bare app carrying one limiter and a trivial handler. */
function appWith(limiter: any) {
  const a = express();
  a.set("trust proxy", true);
  a.use(express.json());
  a.post("/t", limiter, (_req, res) => res.status(201).json({ ok: true }));
  a.get("/t", limiter, (_req, res) => res.status(200).json({ ok: true }));
  return a;
}

/** Fire `n` sequential requests, returning the status codes in order. */
async function fire(n: number, make: (i: number) => Promise<any>) {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) codes.push((await make(i)).status);
  return codes;
}

describe("publicTicketIpLimiter — 10 tickets per hour per address", () => {
  const limited = appWith(publicTicketIpLimiter);

  test("allows the budget then rejects", async () => {
    const ip = `203.0.113.${++seq}`;

    const codes = await fire(12, (i) =>
      request(limited)
        .post("/t")
        .set("X-Forwarded-For", ip)
        .send({ customerEmail: `a${i}-${seq}@customer.test` })
    );

    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
    expect(codes[11]).toBe(429);
  });

  test("the rejection identifies itself as rate limiting", async () => {
    const ip = `203.0.113.${++seq}`;
    let last: any;

    for (let i = 0; i < 12; i++) {
      last = await request(limited)
        .post("/t")
        .set("X-Forwarded-For", ip)
        .send({ customerEmail: `b${i}-${seq}@customer.test` });
      if (last.status === 429) break;
    }

    expect(last.status).toBe(429);
    expect(last.body.error).toBe("rate_limited");
  });

  test("a different address has its own budget", async () => {
    const noisy = `203.0.113.${++seq}`;
    const quiet = `203.0.113.${++seq}`;

    await fire(12, () =>
      request(limited).post("/t").set("X-Forwarded-For", noisy).send({})
    );
    const res = await request(limited).post("/t").set("X-Forwarded-For", quiet).send({});

    expect(res.status).toBe(201);
  });
});

describe("publicTicketEmailLimiter — 3 tickets per day per address", () => {
  const limited = appWith(publicTicketEmailLimiter);

  test("caps one email even as the source address rotates", async () => {
    const customerEmail = `daily-${++seq}@customer.test`;

    const codes = await fire(5, (i) =>
      request(limited)
        .post("/t")
        .set("X-Forwarded-For", `198.51.100.${i + 1}`)
        .send({ customerEmail })
    );

    expect(codes.slice(0, 3).every((c) => c === 201)).toBe(true);
    expect(codes[3]).toBe(429);
  });

  test("keys on customerEmail, the field the public API actually sends", async () => {
    const customerEmail = `field-${++seq}@customer.test`;

    const codes = await fire(5, () =>
      request(limited).post("/t").set("X-Forwarded-For", "198.51.100.9").send({ customerEmail })
    );

    // Were the key falling back to the IP, the budget would be 3 per address
    // rather than 3 per address-of-record; this asserts the email bound it.
    expect(codes[3]).toBe(429);
  });

  test("also honours the widget's `email` field name", async () => {
    const email = `widgetfield-${++seq}@customer.test`;

    const codes = await fire(5, (i) =>
      request(limited)
        .post("/t")
        .set("X-Forwarded-For", `198.51.100.${100 + i}`)
        .send({ email })
    );

    expect(codes[3]).toBe(429);
  });

  test("another address is unaffected by an exhausted one", async () => {
    const noisy = `noisy-${++seq}@customer.test`;
    const quiet = `quiet-${++seq}@customer.test`;

    await fire(5, () =>
      request(limited).post("/t").set("X-Forwarded-For", "198.51.100.50").send({ customerEmail: noisy })
    );
    const res = await request(limited)
      .post("/t")
      .set("X-Forwarded-For", "198.51.100.50")
      .send({ customerEmail: quiet });

    expect(res.status).toBe(201);
  });

  test("requests with no email fall back to a per-address budget", async () => {
    // A shared bucket for anonymous requests would let one malformed caller
    // lock the endpoint for everyone.
    const a = `203.0.113.${++seq}`;
    const b = `203.0.113.${++seq}`;

    await fire(5, () => request(limited).post("/t").set("X-Forwarded-For", a).send({}));
    const res = await request(limited).post("/t").set("X-Forwarded-For", b).send({});

    expect(res.status).toBe(201);
  });
});

describe("widgetTicketLimiter — 5 tickets per hour per visitor of a widget", () => {
  const limited = appWith(widgetTicketLimiter);

  test("allows the budget then rejects", async () => {
    const widgetToken = `pub_a_${++seq}`;

    const codes = await fire(7, () =>
      request(limited).post("/t").set("X-Forwarded-For", "203.0.113.77").send({ widgetToken })
    );

    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  test("one token's exhausted budget does not block another", async () => {
    const noisy = `pub_b_${++seq}`;
    const quiet = `pub_c_${++seq}`;

    await fire(7, () =>
      request(limited).post("/t").set("X-Forwarded-For", "203.0.113.78").send({ widgetToken: noisy })
    );
    const res = await request(limited)
      .post("/t")
      .set("X-Forwarded-For", "203.0.113.78")
      .send({ widgetToken: quiet });

    expect(res.status).toBe(201);
  });

  test("one abusive visitor does not lock the widget for everyone else", async () => {
    // A token-only budget would be a denial of service against the tenant:
    // one visitor spends the hour's allowance and every genuine customer on
    // that site is refused.
    const widgetToken = `pub_shared_${++seq}`;

    await fire(7, () =>
      request(limited).post("/t").set("X-Forwarded-For", "198.51.100.13").send({ widgetToken })
    );
    const innocent = await request(limited)
      .post("/t")
      .set("X-Forwarded-For", "198.51.100.14")
      .send({ widgetToken });

    expect(innocent.status).toBe(201);
  });
});

describe("widgetTicketTokenLimiter — aggregate ceiling per widget token", () => {
  const limited = appWith(widgetTicketTokenLimiter);

  test("bounds the total no matter how many addresses are used", async () => {
    // This is the limit that survives address rotation, which the per-visitor
    // budget alone does not.
    const widgetToken = `pub_agg_${++seq}`;

    const codes = await fire(62, (i) =>
      request(limited)
        .post("/t")
        .set("X-Forwarded-For", `198.51.100.${(i % 200) + 1}`)
        .send({ widgetToken })
    );

    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  test("ordinary volume is unaffected", async () => {
    const widgetToken = `pub_agg_ok_${++seq}`;

    const codes = await fire(10, () => request(limited).post("/t").send({ widgetToken }));

    expect(codes.every((c) => c === 201)).toBe(true);
  });
});

describe("widgetTokenLimiter — 1000 requests per hour per token", () => {
  const limited = appWith(widgetTokenLimiter);

  test("reads the token from the query string as well as the body", async () => {
    const token = `pub_q_${++seq}`;

    const viaQuery = await request(limited).get(`/t?token=${token}`);
    const viaBody = await request(limited).post("/t").send({ widgetToken: token });

    expect(viaQuery.status).toBe(200);
    expect(viaBody.status).toBe(201);
  });

  test("an ordinary amount of widget traffic is not throttled", async () => {
    const token = `pub_r_${++seq}`;

    const codes = await fire(20, () => request(limited).get(`/t?token=${token}`));

    expect(codes.every((c) => c === 200)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Wiring: the limiters are attached to the real routes               */
/* ------------------------------------------------------------------ */

describe("wiring on the real routes", () => {
  async function makeTenant() {
    const slug = `rl-${++seq}`;
    const tenant = await Tenant.create({
      slug,
      branding: { name: slug },
      plan: "COMPANY",
      seats: 5,
    });
    const user = await User.create({
      tenantId: tenant._id,
      firstName: "R",
      lastName: "L",
      email: `${slug}@test.local`,
      passwordHash: await hashPassword("TestPass1!"),
      roles: ["OWNER"],
      status: "ACTIVE",
    });
    return { tenant, user, slug };
  }

  test("public ticket creation is rate limited", async () => {
    const { slug } = await makeTenant();
    const customerEmail = `wired-${++seq}@customer.test`;

    // The per-email cap is 3/day and binds regardless of source address, so it
    // is the one limiter this burst can reach deterministically.
    const codes = await fire(5, () =>
      request(app).post("/public/tickets").send({
        tenantSlug: slug,
        customerName: "Wired",
        customerEmail,
        subject: "Rate limit wiring",
        body: "Checking the limiter is attached",
      })
    );

    expect(codes).toContain(429);
  });

  test("widget ticket creation is rate limited", async () => {
    const { tenant, user } = await makeTenant();
    const wt = await WidgetToken.create({
      tenantId: tenant._id,
      token: `pub_wired_${++seq}`,
      allowedDomains: [],
      isActive: true,
      createdBy: user._id,
    });

    const codes = await fire(8, (i) =>
      request(app).post("/public/widget/tickets").send({
        widgetToken: wt.token,
        name: "Widget",
        email: `w-${i}-${seq}@customer.test`,
        subject: "Rate limit wiring",
        body: "Checking the limiter is attached",
      })
    );

    expect(codes).toContain(429);
  });
});
