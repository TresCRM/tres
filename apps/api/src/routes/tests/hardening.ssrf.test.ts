/**
 * @module tests/hardening.ssrf
 * Regression tests for HARDENINGS.md section 6 — outbound webhook SSRF guard.
 *
 * Tenant-supplied webhook URLs are requested by the server itself, so they must
 * not be able to address internal infrastructure.
 */
import { checkOutboundUrl, isSafeOutboundUrl } from "../../utils/ssrf";

describe("checkOutboundUrl — accepts ordinary public endpoints", () => {
  test.each([
    "https://hooks.example.com/incoming",
    "http://example.com/webhook",
    "https://example.co.uk:8443/path?query=1",
    "https://sub.domain.example.com/a/b",
    "https://8.8.8.8/webhook",
    "https://[2606:4700:4700::1111]/webhook",
  ])("accepts %s", (url) => {
    expect(isSafeOutboundUrl(url)).toBe(true);
  });
});

describe("checkOutboundUrl — scheme and shape", () => {
  test.each([
    ["not a url", "malformed_url"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["gopher://example.com/", "unsupported_scheme"],
    ["ftp://example.com/", "unsupported_scheme"],
  ])("rejects %s", (url, reason) => {
    expect(checkOutboundUrl(url)).toEqual({ ok: false, reason });
  });

  test("rejects embedded credentials", () => {
    expect(checkOutboundUrl("https://user:pass@example.com/hook")).toEqual({
      ok: false,
      reason: "credentials_in_url",
    });
  });
});

describe("checkOutboundUrl — loopback and internal names", () => {
  test.each([
    "http://localhost/webhook",
    "http://localhost:3000/webhook",
    "http://LOCALHOST/webhook",
    "http://api.localhost/webhook",
    "http://printer.local/webhook",
  ])("rejects %s", (url) => {
    expect(isSafeOutboundUrl(url)).toBe(false);
  });

  test("rejects a bare hostname with no dot, which only resolves internally", () => {
    expect(checkOutboundUrl("http://intranet/hook")).toEqual({
      ok: false,
      reason: "non_public_host",
    });
  });
});

describe("checkOutboundUrl — private IPv4 ranges", () => {
  test.each([
    ["http://127.0.0.1/hook", "loopback"],
    ["http://127.255.255.254/hook", "loopback range"],
    ["http://10.0.0.1/hook", "10/8"],
    ["http://10.255.255.255/hook", "10/8 upper"],
    ["http://172.16.0.1/hook", "172.16/12 lower"],
    ["http://172.31.255.255/hook", "172.16/12 upper"],
    ["http://192.168.1.1/hook", "192.168/16"],
    ["http://169.254.169.254/hook", "cloud metadata"],
    ["http://0.0.0.0/hook", "this network"],
    ["http://100.64.0.1/hook", "carrier-grade NAT"],
    ["http://224.0.0.1/hook", "multicast"],
    ["http://255.255.255.255/hook", "broadcast"],
  ])("rejects %s (%s)", (url) => {
    expect(isSafeOutboundUrl(url)).toBe(false);
  });

  test.each([
    "http://172.15.0.1/hook",
    "http://172.32.0.1/hook",
    "http://11.0.0.1/hook",
    "http://126.0.0.1/hook",
  ])("accepts %s, which sits just outside a blocked range", (url) => {
    expect(isSafeOutboundUrl(url)).toBe(true);
  });

  test("rejects alternate encodings of a loopback address", () => {
    // The WHATWG URL parser normalises these to 127.0.0.1.
    expect(isSafeOutboundUrl("http://2130706433/hook")).toBe(false);
    expect(isSafeOutboundUrl("http://0177.0.0.1/hook")).toBe(false);
    expect(isSafeOutboundUrl("http://0x7f.0.0.1/hook")).toBe(false);
  });
});

describe("checkOutboundUrl — private IPv6 ranges", () => {
  test.each([
    "http://[::1]/hook",
    "http://[::]/hook",
    "http://[fc00::1]/hook",
    "http://[fd12:3456::1]/hook",
    "http://[fe80::1]/hook",
    "http://[::ffff:127.0.0.1]/hook",
    "http://[::ffff:10.0.0.1]/hook",
  ])("rejects %s", (url) => {
    expect(isSafeOutboundUrl(url)).toBe(false);
  });

  test("accepts a public IPv6 address", () => {
    expect(isSafeOutboundUrl("https://[2001:4860:4860::8888]/hook")).toBe(true);
  });

  test("accepts an IPv4-mapped public address", () => {
    expect(isSafeOutboundUrl("http://[::ffff:8.8.8.8]/hook")).toBe(true);
  });
});
