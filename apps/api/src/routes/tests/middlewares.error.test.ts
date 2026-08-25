/**
 * @module tests/middlewares.error
 * Tests for the activity-logging error middleware and the 404 fallback.
 * This handler records the failure and then delegates, so `next()` must always
 * be called — including when activity logging itself fails.
 */
import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { notFound, errorHandler } from "../../middlewares/error";
import { AppError, ERR } from "../../utils/errors";
import { writeActivity } from "../../services/activity";

jest.mock("../../services/activity", () => ({
  writeActivity: jest.fn(),
}));

const mockWriteActivity = writeActivity as jest.MockedFunction<typeof writeActivity>;

beforeEach(() => {
  mockWriteActivity.mockResolvedValue(undefined as any);
});

afterEach(() => {
  jest.clearAllMocks();
});

function makeRes() {
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
  return { res, captured };
}

function makeReq(overrides: Record<string, any> = {}): Request {
  return {
    headers: { "x-request-id": "abc" },
    path: "/api/v1/tickets",
    originalUrl: "/api/v1/tickets?page=1",
    ip: "203.0.113.9",
    body: { subject: "hi" },
    get: (name: string) => (name === "user-agent" ? "jest-agent" : undefined),
    ...overrides,
  } as unknown as Request;
}

describe("notFound", () => {
  test("responds 404 with a not_found code", () => {
    const { res, captured } = makeRes();

    notFound(makeReq(), res);

    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({ error: "not_found" });
  });
});

describe("errorHandler — status and code derivation", () => {
  test("uses an AppError's status, code and details", async () => {
    const next = jest.fn() as NextFunction;

    await errorHandler(
      ERR.BAD_REQUEST("invalid_email", { field: "email" }),
      makeReq(),
      makeRes().res,
      next
    );

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          status: 400,
          code: "invalid_email",
          details: { field: "email" },
        }),
      })
    );
  });

  test("treats an unknown error as a 500 internal_error", async () => {
    await errorHandler(new Error("boom"), makeReq(), makeRes().res, jest.fn());

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          status: 500,
          code: "internal_error",
          details: undefined,
        }),
      })
    );
  });

  test("records a non-2xx outcome at ERROR level", async () => {
    await errorHandler(new AppError(503, "unavailable"), makeReq(), makeRes().res, jest.fn());

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ level: "ERROR" })
    );
  });

  test("records a 2xx outcome at AUDIT level", async () => {
    await errorHandler(new AppError(200, "ok"), makeReq(), makeRes().res, jest.fn());

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ level: "AUDIT" })
    );
  });
});

describe("errorHandler — recorded context", () => {
  test("attributes the entry to the authenticated tenant and user", async () => {
    const tid = String(new Types.ObjectId());
    const sub = String(new Types.ObjectId());

    await errorHandler(
      new Error("boom"),
      makeReq({ auth: { tid, sub, roles: ["AGENT"] } }),
      makeRes().res,
      jest.fn()
    );

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tid, userId: sub })
    );
  });

  test("leaves tenant and user unset for an anonymous request", async () => {
    await errorHandler(new Error("boom"), makeReq(), makeRes().res, jest.fn());

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined, userId: undefined })
    );
  });

  test("records the resource path, route, ip and user agent", async () => {
    await errorHandler(new Error("boom"), makeReq(), makeRes().res, jest.fn());

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "/api/v1/tickets",
        route: "/api/v1/tickets?page=1",
        ip: "203.0.113.9",
        ua: "jest-agent",
      })
    );
  });

  test("leaves the user agent unset when the header is absent", async () => {
    await errorHandler(
      new Error("boom"),
      makeReq({ get: () => undefined }),
      makeRes().res,
      jest.fn()
    );

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ ua: undefined })
    );
  });

  test("falls back to url when originalUrl is missing", async () => {
    await errorHandler(
      new Error("boom"),
      makeReq({ originalUrl: undefined, url: "/fallback" }),
      makeRes().res,
      jest.fn()
    );

    expect(mockWriteActivity).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/fallback" })
    );
  });

  test("serialises the request body into the entry metadata", async () => {
    await errorHandler(
      new Error("boom"),
      makeReq({ body: { subject: "printer on fire" } }),
      makeRes().res,
      jest.fn()
    );

    const entry = mockWriteActivity.mock.calls[0][0] as any;
    expect(JSON.parse(entry.meta.body)).toEqual({ subject: "printer on fire" });
  });
});

describe("errorHandler — delegation", () => {
  test("always calls next so the terminal handler can respond", async () => {
    const next = jest.fn();

    await errorHandler(new Error("boom"), makeReq(), makeRes().res, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  test("still calls next when activity logging rejects", async () => {
    mockWriteActivity.mockRejectedValue(new Error("mongo is down"));
    const next = jest.fn();

    await expect(
      errorHandler(new Error("boom"), makeReq(), makeRes().res, next as NextFunction)
    ).resolves.toBeUndefined();

    expect(next).toHaveBeenCalled();
  });

  test("does not send a response itself", async () => {
    const { res, captured } = makeRes();

    await errorHandler(new Error("boom"), makeReq(), res, jest.fn());

    expect(captured.status).toBe(0);
    expect(captured.body).toBeUndefined();
  });
});
