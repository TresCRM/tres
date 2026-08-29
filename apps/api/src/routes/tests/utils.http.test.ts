/**
 * @module tests/utils.http
 * Unit tests for the JSON error helpers.
 *
 * The property that matters most here is what does NOT come back: these
 * responses previously carried Express's internal Route object, which
 * serialises its middleware stack to the caller.
 */
import type { Request, Response } from "express";
import { testSetup, testTeardown } from "../../tests/helpers";
import { badRequest, paymentRequired, forbidden, notFound } from "../../utils/http";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

interface Captured {
  status: number;
  body: any;
}

function makeRes(): { res: Response; captured: Captured } {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: any) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, captured };
}

/** A request carrying the Route object Express attaches to matched routes. */
function makeReq(overrides: Record<string, any> = {}): Request {
  return {
    method: "POST",
    originalUrl: "/api/v1/tickets?draft=1",
    url: "/tickets",
    baseUrl: "/api/v1/tickets",
    headers: {},
    route: {
      path: "/",
      methods: { post: true },
      stack: [
        { name: "requireAuth", handle: () => {}, method: "post" },
        { name: "requireActiveSubscription", handle: () => {}, method: "post" },
      ],
    },
    ...overrides,
  } as unknown as Request;
}

describe("error helpers — status and code", () => {
  test("badRequest answers 400", async () => {
    const { res, captured } = makeRes();
    await badRequest(makeReq(), res);
    expect(captured.status).toBe(400);
    expect(captured.body.error).toBe("invalid_request");
  });

  test("paymentRequired answers 402", async () => {
    const { res, captured } = makeRes();
    await paymentRequired(makeReq(), res);
    expect(captured.status).toBe(402);
    expect(captured.body.error).toBe("payment_required");
  });

  test("forbidden answers 403", async () => {
    const { res, captured } = makeRes();
    await forbidden(makeReq(), res);
    expect(captured.status).toBe(403);
    expect(captured.body.error).toBe("forbidden");
  });

  test("notFound answers 404", async () => {
    const { res, captured } = makeRes();
    await notFound(makeReq(), res);
    expect(captured.status).toBe(404);
    expect(captured.body.error).toBe("not_found");
  });

  test("each accepts a code and message override", async () => {
    const { res, captured } = makeRes();
    await badRequest(makeReq(), res, "invalid_email", "That address looks wrong");
    expect(captured.body.error).toBe("invalid_email");
    expect(captured.body.message).toBe("That address looks wrong");
  });

  test("badRequest passes validation meta through", async () => {
    const { res, captured } = makeRes();
    await badRequest(makeReq(), res, "invalid_request", "bad", { field: "subject" });
    expect(captured.body.meta).toEqual({ field: "subject" });
  });
});

describe("error helpers — route reporting", () => {
  test("the route is the path the caller asked for, as a string", async () => {
    const { res, captured } = makeRes();

    await paymentRequired(makeReq(), res);

    expect(typeof captured.body.route).toBe("string");
    expect(captured.body.route).toBe("/api/v1/tickets?draft=1");
  });

  test.each([
    ["badRequest", badRequest],
    ["paymentRequired", paymentRequired],
    ["forbidden", forbidden],
    ["notFound", notFound],
  ])("%s does not leak the middleware stack", async (_name, helper) => {
    const { res, captured } = makeRes();

    await (helper as any)(makeReq(), res);

    // Serialising req.route exposed every middleware name on the matched route.
    const serialized = JSON.stringify(captured.body);
    expect(serialized).not.toContain("requireAuth");
    expect(serialized).not.toContain("requireActiveSubscription");
    expect(serialized).not.toContain("stack");
  });

  test("falls back to url when originalUrl is absent", async () => {
    const { res, captured } = makeRes();

    await notFound(makeReq({ originalUrl: undefined }), res);

    expect(captured.body.route).toBe("/tickets");
  });

  test("falls back to baseUrl when neither is present", async () => {
    const { res, captured } = makeRes();

    await notFound(makeReq({ originalUrl: undefined, url: undefined }), res);

    expect(captured.body.route).toBe("/api/v1/tickets");
  });

  test("reports an empty string rather than undefined when nothing is known", async () => {
    const { res, captured } = makeRes();

    await notFound(
      makeReq({ originalUrl: undefined, url: undefined, baseUrl: undefined }),
      res
    );

    expect(captured.body.route).toBe("");
  });
});
