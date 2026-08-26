/**
 * @module tests/middlewares.csrf
 * Tests for double-submit CSRF protection.
 *
 * The middleware short-circuits when ENV.IS_TEST is set (supertest does not
 * perform the browser cookie flow), so these tests flip that flag off in order
 * to exercise the real enforcement path.
 */
import type { Request, Response, NextFunction } from "express";
import { ENV } from "../../config/env";
import { csrfProtection } from "../../middlewares/csrf";

const savedIsTest = (ENV as any).IS_TEST;
const savedNodeEnv = process.env.NODE_ENV;

/** @types/node declares NODE_ENV read-only, so go through the index signature. */
function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

beforeEach(() => {
  (ENV as any).IS_TEST = false;
});

afterEach(() => {
  (ENV as any).IS_TEST = savedIsTest;
  setNodeEnv(savedNodeEnv);
});

interface Run {
  nextCalled: boolean;
  status: number;
  body: any;
  cookies: { name: string; value: string; opts: any }[];
  req: any;
}

function run(reqOverrides: Record<string, any> = {}): Run {
  const result: Run = {
    nextCalled: false,
    status: 0,
    body: undefined,
    cookies: [],
    req: undefined,
  };

  const res = {
    cookie(name: string, value: string, opts: any) {
      result.cookies.push({ name, value, opts });
      return this;
    },
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: any) {
      result.body = payload;
      return this;
    },
  } as unknown as Response;

  const req = {
    method: "POST",
    path: "/api/v1/tickets",
    baseUrl: "/api/v1/tickets",
    headers: {},
    cookies: {},
    ...reqOverrides,
  } as unknown as Request;
  result.req = req;

  csrfProtection(req, res, (() => {
    result.nextCalled = true;
  }) as NextFunction);

  return result;
}

const TOKEN = "a".repeat(64);

describe("csrfProtection — cookie issuance", () => {
  test("issues a token cookie when the request has none", () => {
    const result = run();

    expect(result.cookies[0].name).toBe("_csrf");
    expect(result.cookies[0].value).toHaveLength(64);
  });

  test("the cookie is readable by JS and scoped to the site root", () => {
    const opts = run().cookies[0].opts;

    expect(opts.httpOnly).toBe(false);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  test("the cookie is not marked secure outside production", () => {
    expect(run().cookies[0].opts.secure).toBe(false);
  });

  test("the cookie is marked secure in production", () => {
    setNodeEnv("production");

    expect(run().cookies[0].opts.secure).toBe(true);
  });

  test("does not reissue when a token cookie is already present", () => {
    const result = run({
      cookies: { _csrf: TOKEN },
      headers: { "x-csrf-token": TOKEN },
    });

    // Only the post-validation rotation cookie, not a fresh issuance.
    expect(result.cookies).toHaveLength(1);
    expect(result.cookies[0].value).not.toBe(TOKEN);
  });

  test("issues distinct tokens across requests", () => {
    expect(run().cookies[0].value).not.toBe(run().cookies[0].value);
  });
});

describe("csrfProtection — enforcement", () => {
  test("allows a request whose header matches the cookie", () => {
    const result = run({
      cookies: { _csrf: TOKEN },
      headers: { "x-csrf-token": TOKEN },
    });

    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
  });

  test("rejects a mismatched header token", () => {
    const result = run({
      cookies: { _csrf: TOKEN },
      headers: { "x-csrf-token": "b".repeat(64) },
    });

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: "csrf_invalid",
      message: "Invalid or missing CSRF token",
    });
  });

  test("rejects a request with no header token", () => {
    const result = run({ cookies: { _csrf: TOKEN } });

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(403);
  });

  test("rejects when the cookie is missing but a header is supplied", () => {
    // A fresh cookie is minted for this request, so the attacker-supplied
    // header cannot match it.
    const result = run({ headers: { "x-csrf-token": TOKEN } });

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(403);
  });

  test("rotates the token after a successful validation", () => {
    const result = run({
      cookies: { _csrf: TOKEN },
      headers: { "x-csrf-token": TOKEN },
    });

    const rotated = result.cookies[result.cookies.length - 1];
    expect(rotated.name).toBe("_csrf");
    expect(rotated.value).toHaveLength(64);
    expect(rotated.value).not.toBe(TOKEN);
  });

  test("does not rotate the token on a rejected request", () => {
    const result = run({
      cookies: { _csrf: TOKEN },
      headers: { "x-csrf-token": "wrong" },
    });

    expect(result.cookies).toHaveLength(0);
  });

  test("tolerates a request with no cookie jar at all", () => {
    const result = run({ cookies: undefined });

    expect(result.status).toBe(403);
    expect(result.nextCalled).toBe(false);
  });
});

describe("csrfProtection — exemptions", () => {
  test.each(["GET", "HEAD", "OPTIONS"])("skips safe method %s", (method) => {
    const result = run({ method });

    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "enforces on unsafe method %s",
    (method) => {
      expect(run({ method }).status).toBe(403);
    }
  );

  test("skips bearer-token requests as machine-to-machine", () => {
    const result = run({ headers: { authorization: "Bearer abc.def.ghi" } });

    expect(result.nextCalled).toBe(true);
  });

  test("does not skip other authorization schemes", () => {
    const result = run({ headers: { authorization: "Basic dXNlcjpwYXNz" } });

    expect(result.status).toBe(403);
  });

  test("skips API key requests", () => {
    const result = run({ headers: { "x-api-key": "key_123" } });

    expect(result.nextCalled).toBe(true);
  });

  test("skips public endpoints", () => {
    const result = run({ path: "/public/tickets", baseUrl: "/public" });

    expect(result.nextCalled).toBe(true);
  });

  test("skips the health check", () => {
    const result = run({ path: "/healthz", baseUrl: "" });

    expect(result.nextCalled).toBe(true);
  });

  test("skips auth routes, which set the cookie rather than consume it", () => {
    const result = run({ path: "/api/v1/auth/login", baseUrl: "/api/v1/auth" });

    expect(result.nextCalled).toBe(true);
  });

  test("skips auth routes matched via baseUrl alone", () => {
    const result = run({ path: "/login", baseUrl: "/api/v1/auth" });

    expect(result.nextCalled).toBe(true);
  });

  test("still issues a cookie on an exempt request", () => {
    const result = run({ method: "GET" });

    expect(result.cookies[0].name).toBe("_csrf");
  });

  test("skips everything while ENV.IS_TEST is set", () => {
    (ENV as any).IS_TEST = true;

    const result = run();

    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
  });
});
