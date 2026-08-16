import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

const CUSTOMER_TOKEN_TTL = "7d";

export interface CustomerTokenPayload {
  email: string;
  tid: string;
  ticketId?: string;
  type: "customer_access" | "portal_access";
}

export function signCustomerToken(payload: Omit<CustomerTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "customer_access" }, ENV.JWT_SECRET, { expiresIn: CUSTOMER_TOKEN_TTL });
}

export function signPortalToken(email: string, tid: string): string {
  return jwt.sign({ email, tid, type: "portal_access" }, ENV.JWT_SECRET, { expiresIn: CUSTOMER_TOKEN_TTL });
}

export function verifyCustomerToken(token: string): CustomerTokenPayload {
  const payload = jwt.verify(token, ENV.JWT_SECRET) as any;
  if (payload.type !== "customer_access" && payload.type !== "portal_access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

/**
 * Tracking URL that points to the customer portal page (magic-link flow).
 * Includes `tenant` slug when provided so the portal can fully bootstrap its
 * session (needed for nav links that list all tickets, profile updates, etc.).
 */
export function buildTicketTrackingUrl(ticketId: string, token: string, tenantSlug?: string): string {
  const parts = [`token=${encodeURIComponent(token)}`];
  if (tenantSlug) parts.push(`tenant=${encodeURIComponent(tenantSlug)}`);
  return `${ENV.FRONTEND_ORIGIN}/portal/tickets/${ticketId}?${parts.join("&")}`;
}
