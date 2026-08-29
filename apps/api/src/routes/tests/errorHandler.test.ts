/**
 * @module tests/errorHandler
 * Tests for the terminal Express error handler: status/code mapping, the
 * production redaction rules, and persistence of the error log.
 */
import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { MongoServerError } from "mongodb";
import { ZodError, z } from "zod";
import { testSetup, testTeardown } from "../../tests/helpers";
import { ErrorLog } from "../../models/ErrorLog";
import { errorHandler } from "../../middlewares/errorHandler";
import { HttpError, badRequest, notFound } from "../../utils/httpError";

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

const savedNodeEnv = process.env.NODE_ENV;

/** @types/node declares NODE_ENV read-only, so go through the index signature. */
function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

afterEach(async () => {
  setNodeEnv(savedNodeEnv);
  await ErrorLog.deleteMany({});
});

interface Captured {
  status: number;
  body: any;
  /** Correlates this invocation with the error-log row it produces. */
  requestId: string;
}

let seq = 0;

/**
 * Minimal Express double that records what the handler sent. Every call gets a
 * unique ctx.requestId so its error-log row can be identified unambiguously.
 */
function invoke(err: any, reqOverrides: Record<string, any> = {}): Captured {
  const captured = { status: 0, body: undefined as any };
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

  const { ctx: ctxOverride, ...rest } = reqOverrides;
  const ctx = { requestId: `eh-${++seq}`, ...(ctxOverride || {}) };
  const req = {
    method: "POST",
    originalUrl: "/api/v1/tickets",
    ...rest,
    ctx,
  } as unknown as Request;

  errorHandler(err, req, res, (() => {}) as NextFunction);
  return { ...captured, requestId: ctx.requestId };
}

/**
 * The error-log row is written from a setImmediate callback into the database,
 * so poll for it rather than assuming it lands within a fixed number of ticks.
 */
async function waitForLog(requestId: string, timeoutMs = 10000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await ErrorLog.findOne({ requestId }).lean();
    if (doc) return doc;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for error log ${requestId}`);
}

describe("errorHandler — status and code mapping", () => {
  test("defaults to a 500 internal error", () => {
    const result = invoke(new Error("boom"));
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("internal_error");
    expect(result.body.message).toBe("Something went wrong");
  });

  test("honours an HttpError's status, code and message", () => {
    const result = invoke(notFound());
    expect(result.status).toBe(404);
    expect(result.body.error).toBe("not_found");
    expect(result.body.message).toBe("Resource not found");
  });

  test("passes HttpError details through", () => {
    const result = invoke(badRequest({ field: "subject" }));
    expect(result.status).toBe(400);
    expect(result.body.details).toEqual({ field: "subject" });
  });

  test("maps a ZodError to a 400 validation error", () => {
    const parsed = z.object({ subject: z.string() }).safeParse({ subject: 1 });
    const result = invoke((parsed as any).error as ZodError);

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid_request");
    expect(result.body.details[0]).toEqual({
      path: "subject",
      message: expect.any(String),
    });
  });

  test("maps a duplicate-key MongoServerError to 409", () => {
    const err = new MongoServerError({ message: "E11000 duplicate key" });
    err.code = 11000;

    const result = invoke(err);

    expect(result.status).toBe(409);
    expect(result.body.error).toBe("data_error");
    expect(result.body.details).toContain("E11000");
  });

  test("leaves other MongoServerErrors as a 500", () => {
    const err = new MongoServerError({ message: "some other failure" });
    err.code = 121;

    expect(invoke(err).status).toBe(500);
  });

  test("a duplicate-key error takes precedence over an HttpError status", () => {
    // The 11000 branch is evaluated after the HttpError branch by design.
    const err = new MongoServerError({ message: "E11000 duplicate key" });
    err.code = 11000;

    expect(invoke(err).body.error).toBe("data_error");
  });
});

describe("errorHandler — production redaction", () => {
  test("hides Zod issue details in production", () => {
    setNodeEnv("production");
    const parsed = z.object({ subject: z.string() }).safeParse({ subject: 1 });

    const result = invoke((parsed as any).error as ZodError);

    expect(result.body.details).toBe("Validation failed");
  });

  test("hides the duplicate-key message in production", () => {
    setNodeEnv("production");
    const err = new MongoServerError({ message: "E11000 dup key on users.email" });
    err.code = 11000;

    expect(invoke(err).body.details).toBe("Duplicate record");
  });

  test("omits the stack from the persisted log in production", async () => {
    setNodeEnv("production");

    const { requestId } = invoke(new Error("boom"));

    const logged = await waitForLog(requestId);
    expect(logged.stack).toBeUndefined();
  });

  test("keeps the stack outside production", async () => {
    const { requestId } = invoke(new Error("boom"));

    const logged = await waitForLog(requestId);
    expect(logged.stack).toContain("Error: boom");
  });
});

describe("errorHandler — persisted error log", () => {
  test("records the route, method and mapped status", async () => {
    const { requestId } = invoke(notFound());

    const logged = await waitForLog(requestId);
    expect(logged).toMatchObject({
      route: "/api/v1/tickets",
      method: "POST",
      http: 404,
      code: "not_found",
    });
  });

  test("attributes the error to the authenticated actor and tenant", async () => {
    const tid = new Types.ObjectId();
    const sub = new Types.ObjectId();

    const { requestId } = invoke(new Error("boom"), {
      auth: { tid: String(tid), sub: String(sub), roles: ["AGENT"] },
    });

    const logged = await waitForLog(requestId);
    expect(String(logged.tenantId)).toBe(String(tid));
    expect(String(logged.actorId)).toBe(String(sub));
    expect(logged.roles).toEqual(["AGENT"]);
  });

  test("records an anonymous error with no tenant or actor", async () => {
    const { requestId } = invoke(new Error("boom"));

    const logged = await waitForLog(requestId);
    expect(logged.tenantId).toBeUndefined();
    expect(logged.actorId).toBeUndefined();
    expect(logged.roles).toEqual([]);
  });

  test("carries the request context through", async () => {
    invoke(new Error("boom"), {
      ctx: { requestId: "req-123", ip: "203.0.113.9", ua: "jest" },
    });

    const logged = await waitForLog("req-123");
    expect(logged).toMatchObject({
      requestId: "req-123",
      ip: "203.0.113.9",
      ua: "jest",
    });
  });
});

describe("errorHandler — resilience", () => {
  test("falls back to the route path when originalUrl is absent", () => {
    const result = invoke(new Error("boom"), {
      originalUrl: undefined,
      baseUrl: "/api/v1/tickets",
      route: { path: "/:id" },
    });

    expect(result.status).toBe(500);
  });

  test("still responds when the log document cannot be built", () => {
    // A malformed tenant id makes asObjectId throw inside the try block;
    // the response must still be sent.
    const result = invoke(new Error("boom"), {
      auth: { tid: "not-a-valid-object-id", roles: [] },
    });

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("internal_error");
  });

  test("uses req.log when the request carries a logger", () => {
    const error = jest.fn();

    const result = invoke(new Error("boom"), { log: { error } });

    expect(result.status).toBe(500);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ http: 500, code: "internal_error" }),
      "request failed"
    );
  });

  test("tolerates a request with no logger attached", () => {
    expect(() => invoke(new Error("boom"))).not.toThrow();
  });

  test("handles a thrown non-Error value", () => {
    const result = invoke("just a string");
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("internal_error");
  });

  test("handles a custom HttpError subclass instance", () => {
    const result = invoke(new HttpError({ code: "teapot", http: 418, message: "I'm a teapot" }));
    expect(result.status).toBe(418);
    expect(result.body).toMatchObject({ error: "teapot", message: "I'm a teapot" });
  });
});
