/**
 * @module tests/utils.httpError
 * Unit tests for the HttpError wrapper and its shorthand constructors.
 */
import {
  HttpError,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
} from "../../utils/httpError";
import { ERR } from "../../constants/errors";

describe("HttpError", () => {
  test("adopts the code, status and message of the error descriptor", () => {
    const err = new HttpError(ERR.RATE_LIMITED);
    expect(err.code).toBe("rate_limited");
    expect(err.http).toBe(429);
    expect(err.message).toBe("Too many requests");
  });

  test("carries optional details", () => {
    expect(new HttpError(ERR.VALIDATION, { field: "email" }).details).toEqual({
      field: "email",
    });
  });

  test("leaves details undefined when none are given", () => {
    expect(new HttpError(ERR.INTERNAL).details).toBeUndefined();
  });

  test("is a real Error and is throwable", () => {
    const err = new HttpError(ERR.INTERNAL);
    expect(err).toBeInstanceOf(Error);
    expect(() => {
      throw err;
    }).toThrow("Something went wrong");
  });
});

describe("shorthand constructors", () => {
  test("badRequest maps to the validation descriptor", () => {
    const err = badRequest();
    expect(err.http).toBe(400);
    expect(err.code).toBe("invalid_request");
  });

  test("badRequest forwards validation details", () => {
    expect(badRequest({ field: "subject" }).details).toEqual({ field: "subject" });
  });

  test("notFound maps to 404", () => {
    expect(notFound()).toMatchObject({ http: 404, code: "not_found" });
  });

  test("unauthorized maps to 401", () => {
    expect(unauthorized()).toMatchObject({ http: 401, code: "unauthorized" });
  });

  test("forbidden maps to 403", () => {
    expect(forbidden()).toMatchObject({ http: 403, code: "forbidden" });
  });

  test("each call returns a distinct HttpError", () => {
    expect(notFound()).not.toBe(notFound());
    expect(notFound()).toBeInstanceOf(HttpError);
  });
});
