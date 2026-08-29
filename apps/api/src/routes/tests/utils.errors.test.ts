/**
 * @module tests/utils.errors
 * Unit tests for the AppError type and the ERR factory shorthands.
 */
import { AppError, ERR, MSG } from "../../utils/errors";

describe("AppError", () => {
  test("carries status, code and details", () => {
    const err = new AppError(422, "unprocessable", "Bad shape", { field: "email" });
    expect(err.status).toBe(422);
    expect(err.code).toBe("unprocessable");
    expect(err.message).toBe("Bad shape");
    expect(err.details).toEqual({ field: "email" });
  });

  test("falls back to the code as the message", () => {
    expect(new AppError(400, "bad_request").message).toBe("bad_request");
  });

  test("is a real Error and is throwable/catchable", () => {
    const err = new AppError(500, "internal_error");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(() => {
      throw err;
    }).toThrow("internal_error");
  });

  test("leaves details undefined when not supplied", () => {
    expect(new AppError(404, "not_found").details).toBeUndefined();
  });
});

describe("ERR factories", () => {
  test("map to the expected status codes", () => {
    expect(ERR.BAD_REQUEST().status).toBe(400);
    expect(ERR.UNAUTHORIZED().status).toBe(401);
    expect(ERR.PAYMENT_REQUIRED().status).toBe(402);
    expect(ERR.FORBIDDEN().status).toBe(403);
    expect(ERR.NOT_FOUND().status).toBe(404);
    expect(ERR.CONFLICT().status).toBe(409);
    expect(ERR.INTERNAL().status).toBe(500);
  });

  test("use sensible default codes", () => {
    expect(ERR.BAD_REQUEST().code).toBe("bad_request");
    expect(ERR.UNAUTHORIZED().code).toBe("unauthorized");
    expect(ERR.PAYMENT_REQUIRED().code).toBe("payment_required");
    expect(ERR.FORBIDDEN().code).toBe("forbidden");
    expect(ERR.NOT_FOUND().code).toBe("not_found");
    expect(ERR.CONFLICT().code).toBe("conflict");
    expect(ERR.INTERNAL().code).toBe("internal_error");
  });

  test("accept code overrides", () => {
    expect(ERR.BAD_REQUEST("invalid_email").code).toBe("invalid_email");
    expect(ERR.CONFLICT("email_taken").code).toBe("email_taken");
    expect(ERR.NOT_FOUND("ticket_not_found").code).toBe("ticket_not_found");
    expect(ERR.PAYMENT_REQUIRED("seat_limit").code).toBe("seat_limit");
  });

  test("BAD_REQUEST carries validation details through", () => {
    const err = ERR.BAD_REQUEST("invalid_request", { field: "subject" });
    expect(err.details).toEqual({ field: "subject" });
  });

  test("each call returns a fresh instance", () => {
    expect(ERR.UNAUTHORIZED()).not.toBe(ERR.UNAUTHORIZED());
    expect(ERR.UNAUTHORIZED()).toBeInstanceOf(AppError);
  });
});

describe("MSG", () => {
  test("exposes the shared human-readable messages", () => {
    expect(MSG.EMAIL_TAKEN).toMatch(/email/i);
    expect(MSG.TENANT_SLUG_TAKEN).toMatch(/slug/i);
    expect(MSG.INVALID_LOGIN).toMatch(/password/i);
  });
});
