export const ERR = {
  INTERNAL: { code: "internal_error", http: 500, message: "Something went wrong" },
  NOT_FOUND: { code: "not_found", http: 404, message: "Resource not found" },
  UNAUTHORIZED: { code: "unauthorized", http: 401, message: "Authentication required" },
  FORBIDDEN: { code: "forbidden", http: 403, message: "Forbidden" },
  VALIDATION: { code: "invalid_request", http: 400, message: "Invalid request" },
  RATE_LIMITED: { code: "rate_limited", http: 429, message: "Too many requests" },
  SUBSCRIPTION: { code: "payment_required", http: 402, message: "Subscription required or expired" },
  MONGOERRORS: { code: "data_error", http: 409, message: "Database errors" },
} as const;

export type ErrorCode = keyof typeof ERR;
