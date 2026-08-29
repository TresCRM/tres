type Plain = Record<string, any>;

// Lookups below lowercase the incoming key, so these entries must be lowercase
// too — otherwise camelCase secrets (refreshToken, newPassword, ...) never match.
const SENSITIVE_KEYS = new Set([
  "password", "passwordconfirm", "currentpassword", "newpassword",
  "token", "accesstoken", "refreshtoken"
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
