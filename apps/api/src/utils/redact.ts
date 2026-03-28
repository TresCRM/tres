type Plain = Record<string, any>;

const SENSITIVE_KEYS = new Set([
  "password", "passwordConfirm", "currentPassword", "newPassword",
  "token", "accessToken", "refreshToken"
]);

export function redactBody(input: any): any {
  if (!input || typeof input !== "object") return input;
  const out: Plain = Array.isArray(input) ? [] : {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "***";
    } else if (v && typeof v === "object") {
      out[k] = redactBody(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function redactHeaders(h: Plain) {
  const copy = { ...h };
  if (copy.authorization) copy.authorization = "****";
  if (copy.cookie) copy.cookie = "****";
  return copy;
}
