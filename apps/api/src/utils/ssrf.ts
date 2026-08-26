/**
 * @module utils/ssrf
 * Guard for user-supplied URLs that the server itself will request
 * (outbound webhooks), so a tenant cannot point us at internal infrastructure.
 *
 * Scope and limits — read before relying on this:
 *  - This inspects the *literal* host in the URL. It does not resolve DNS, so a
 *    hostname that resolves to a private address still passes. Blocking that
 *    requires resolving and pinning the address at request time (and re-checking
 *    on redirects); this guard is the first layer, not the whole defence.
 *  - Node's WHATWG URL parser normalises the alternate IPv4 encodings
 *    (decimal, octal, hex — e.g. http://2130706433 becomes 127.0.0.1), so those
 *    are covered by the plain range checks below.
 */

/** Parse dotted-quad IPv4 into its 32-bit value, or null if not IPv4. */
function ipv4ToInt(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inRange(ip: number, cidrBase: string, bits: number): boolean {
  const base = ipv4ToInt(cidrBase);
  if (base === null) return false;
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (base & mask) >>> 0;
}

/** IPv4 blocks that must never be reachable from a tenant-supplied webhook. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // carrier-grade NAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local, incl. cloud metadata at 169.254.169.254
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved, incl. 255.255.255.255
];

function isBlockedIpv4(host: string): boolean {
  const ip = ipv4ToInt(host);
  if (ip === null) return false;
  return BLOCKED_V4.some(([base, bits]) => inRange(ip, base, bits));
}

/**
 * Expand an IPv6 literal into its eight 16-bit groups, or null if unparseable.
 *
 * Matching on the textual form is not safe here: the URL parser rewrites
 * ::ffff:127.0.0.1 into its hex form ::ffff:7f00:1, so a text rule keyed on the
 * dotted spelling misses the very address it is meant to block.
 */
function parseIpv6(input: string): number[] | null {
  let text = input;

  // A trailing dotted quad (::ffff:127.0.0.1) becomes two hex groups.
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const v4 = ipv4ToInt(tail[1]);
    if (v4 === null) return null;
    const hi = (v4 >>> 16).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    text = text.slice(0, tail.index) + `${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || rest === null) return null;

  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 0) return null;
    return [...head, ...Array(fill).fill(0), ...rest];
  }

  return head.length === 8 ? head : null;
}

function isBlockedIpv6(host: string): boolean {
  // new URL() keeps IPv6 hosts in brackets.
  const raw = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!raw.includes(":")) return false;

  const g = parseIpv6(raw);
  if (!g) return true; // unparseable IPv6-looking host — refuse rather than guess

  const leadingZero = g.slice(0, 5).every(x => x === 0);

  // ::  and ::1
  if (g.every(x => x === 0)) return true;
  if (leadingZero && g[5] === 0 && g[6] === 0 && g[7] === 1) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
  if (leadingZero && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = ((g[6] << 16) | g[7]) >>> 0;
    const dotted = [v4 >>> 24, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255].join(".");
    return isBlockedIpv4(dotted);
  }

  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

  return false;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

export interface UrlCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether the server may issue a request to this URL.
 * Returns a reason on rejection so callers can surface a useful message.
 */
export function checkOutboundUrl(raw: string): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }

  // Embedded credentials get replayed on every delivery; refuse them outright.
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_in_url" };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "missing_host" };

  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: "loopback_host" };
  // .localhost is reserved for loopback; .local is mDNS on the local segment.
  if (host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "loopback_host" };
  }
  // A bare label ("intranet", "metadata") only resolves inside a private network.
  if (!host.includes(".") && !host.includes(":")) {
    return { ok: false, reason: "non_public_host" };
  }

  if (isBlockedIpv4(host)) return { ok: false, reason: "private_address" };
  if (isBlockedIpv6(host)) return { ok: false, reason: "private_address" };

  return { ok: true };
}

/** Convenience predicate for call sites that do not need the reason. */
export function isSafeOutboundUrl(raw: string): boolean {
  return checkOutboundUrl(raw).ok;
}
