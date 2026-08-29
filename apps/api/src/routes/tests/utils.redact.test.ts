/**
 * @module tests/utils.redact
 * Unit tests for request-body/header redaction used by the logging middleware.
 * These guard the "no secrets in logs" property, so they assert both that
 * sensitive keys are masked and that nothing else is altered.
 */
import { redactBody, redactHeaders } from "../../utils/redact";

describe("redactBody", () => {
  test("masks top-level sensitive keys", () => {
    expect(redactBody({ email: "a@b.com", password: "hunter2" })).toEqual({
      email: "a@b.com",
      password: "***",
    });
  });

  test("masks every key in the sensitive set", () => {
    const input = {
      password: "p",
      passwordConfirm: "p",
      currentPassword: "p",
      newPassword: "p",
      token: "t",
      accessToken: "t",
      refreshToken: "t",
    };
    const out = redactBody(input);
    for (const key of Object.keys(input)) {
      expect(out[key]).toBe("***");
    }
  });

  test("matches sensitive keys case-insensitively", () => {
    expect(redactBody({ PASSWORD: "x", RefreshToken: "y" })).toEqual({
      PASSWORD: "***",
      RefreshToken: "***",
    });
  });

  test("recurses into nested objects", () => {
    expect(
      redactBody({ user: { name: "Ada", credentials: { password: "s3cret" } } })
    ).toEqual({
      user: { name: "Ada", credentials: { password: "***" } },
    });
  });

  test("preserves arrays as arrays and redacts inside them", () => {
    const out = redactBody({ users: [{ password: "a" }, { password: "b" }] });
    expect(Array.isArray(out.users)).toBe(true);
    expect(out.users).toEqual([{ password: "***" }, { password: "***" }]);
  });

  test("redacts a top-level array", () => {
    const out = redactBody([{ token: "t", keep: 1 }]);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([{ token: "***", keep: 1 }]);
  });

  test("returns primitives and nullish input unchanged", () => {
    expect(redactBody(null)).toBeNull();
    expect(redactBody(undefined)).toBeUndefined();
    expect(redactBody("plain")).toBe("plain");
    expect(redactBody(42)).toBe(42);
    expect(redactBody(false)).toBe(false);
  });

  test("does not mutate the input object", () => {
    const input = { password: "hunter2", nested: { token: "t" } };
    redactBody(input);
    expect(input.password).toBe("hunter2");
    expect(input.nested.token).toBe("t");
  });

  test("leaves non-sensitive values of every type intact", () => {
    const out = redactBody({ n: 1, s: "x", b: true, nil: null });
    expect(out).toEqual({ n: 1, s: "x", b: true, nil: null });
  });
});

describe("redactHeaders", () => {
  test("masks authorization and cookie headers", () => {
    expect(
      redactHeaders({ authorization: "Bearer abc", cookie: "sid=1", accept: "*/*" })
    ).toEqual({ authorization: "****", cookie: "****", accept: "*/*" });
  });

  test("leaves headers untouched when neither is present", () => {
    expect(redactHeaders({ accept: "application/json" })).toEqual({
      accept: "application/json",
    });
  });

  test("does not mutate the input headers", () => {
    const headers = { authorization: "Bearer abc" };
    redactHeaders(headers);
    expect(headers.authorization).toBe("Bearer abc");
  });
});
