/**
 * @module tests/utils.totp
 * Unit tests for the dependency-free RFC 6238 TOTP implementation.
 * Verified against the reference vectors in RFC 6238 Appendix B (SHA-1).
 */
import {
  generateSecret,
  generateTOTP,
  verifyTOTP,
  buildOtpAuthUri,
} from "../../utils/totp";

// RFC 6238 Appendix B seed: ASCII "12345678901234567890", Base32-encoded.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp — generateSecret", () => {
  test("20 bytes encodes to exactly 32 Base32 chars with no padding", () => {
    const secret = generateSecret(20);
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  test("honours a custom byte length", () => {
    expect(generateSecret(10)).toHaveLength(16);
  });

  test("emits a trailing partial group when bits do not divide evenly by 5", () => {
    // 1 byte = 8 bits -> one full 5-bit group + a 3-bit remainder that is padded out.
    expect(generateSecret(1)).toHaveLength(2);
  });

  test("successive secrets differ", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe("totp — generateTOTP against RFC 6238 vectors", () => {
  // The RFC publishes 8-digit codes; the 6-digit form is the low 6 digits.
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  test.each(vectors)("T=%i -> %s", (time, expected) => {
    expect(generateTOTP(RFC_SECRET, 30, 6, time)).toBe(expected);
  });

  test("produces 8-digit codes when asked", () => {
    expect(generateTOTP(RFC_SECRET, 30, 8, 59)).toBe("94287082");
  });

  test("left-pads short codes to the requested width", () => {
    const code = generateTOTP(RFC_SECRET, 30, 6, 1234567890);
    expect(code).toBe("005924");
    expect(code).toHaveLength(6);
  });

  test("defaults to the current time when none is given", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(generateTOTP(RFC_SECRET)).toBe(generateTOTP(RFC_SECRET, 30, 6, now));
  });

  test("codes are stable within a step and change across steps", () => {
    // Step 1 spans T=30..59; step 2 begins at T=60.
    expect(generateTOTP(RFC_SECRET, 30, 6, 30)).toBe(
      generateTOTP(RFC_SECRET, 30, 6, 59)
    );
    expect(generateTOTP(RFC_SECRET, 30, 6, 59)).not.toBe(
      generateTOTP(RFC_SECRET, 30, 6, 60)
    );
  });
});

describe("totp — base32 decoding tolerance", () => {
  test("secrets are case-insensitive and ignore padding and whitespace", () => {
    const expected = generateTOTP(RFC_SECRET, 30, 6, 59);
    expect(generateTOTP(RFC_SECRET.toLowerCase(), 30, 6, 59)).toBe(expected);
    expect(generateTOTP("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ", 30, 6, 59)).toBe(expected);
    expect(generateTOTP(`${RFC_SECRET}======`, 30, 6, 59)).toBe(expected);
  });

  test("characters outside the Base32 alphabet are skipped", () => {
    const expected = generateTOTP(RFC_SECRET, 30, 6, 59);
    expect(generateTOTP(`${RFC_SECRET}!!!`, 30, 6, 59)).toBe(expected);
  });
});

describe("totp — verifyTOTP", () => {
  test("accepts the code for the current step", () => {
    const secret = generateSecret();
    expect(verifyTOTP(generateTOTP(secret), secret)).toBe(true);
  });

  test("rejects an unrelated code", () => {
    expect(verifyTOTP("000000", generateSecret(), 0)).toBe(false);
  });

  test("tolerates one step of clock skew in either direction", () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTOTP(generateTOTP(secret, 30, 6, now - 30), secret)).toBe(true);
    expect(verifyTOTP(generateTOTP(secret, 30, 6, now + 30), secret)).toBe(true);
  });

  test("rejects codes outside the window", () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    const twoStepsAgo = generateTOTP(secret, 30, 6, now - 60);
    expect(verifyTOTP(twoStepsAgo, secret, 1)).toBe(false);
    expect(verifyTOTP(twoStepsAgo, secret, 2)).toBe(true);
  });

  test("window=0 accepts only the exact current step", () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    expect(verifyTOTP(generateTOTP(secret, 30, 6, now), secret, 0)).toBe(true);
    expect(verifyTOTP(generateTOTP(secret, 30, 6, now - 30), secret, 0)).toBe(false);
  });

  test("a code from one secret does not verify against another", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(verifyTOTP(generateTOTP(a), b)).toBe(false);
  });
});

describe("totp — buildOtpAuthUri", () => {
  test("builds an otpauth URI with the standard parameters", () => {
    const uri = buildOtpAuthUri("agent@example.com", "TRES CRM", RFC_SECRET);
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  test("URL-encodes the label and issuer", () => {
    const uri = buildOtpAuthUri("agent+tag@example.com", "TRES CRM", RFC_SECRET);
    expect(uri).toContain(encodeURIComponent("TRES CRM:agent+tag@example.com"));
    expect(uri).toContain(`issuer=${encodeURIComponent("TRES CRM")}`);
    expect(uri).not.toContain(" ");
  });
});
