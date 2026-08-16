/**
 * @module middlewares/apiKeyAuth
 * API key authentication for external /ext/* endpoints.
 * Lookup by prefix (first 12 chars), verify with Argon2, enforce scopes.
 */
import type { Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { ApiKey } from "../models/ApiKey";
import { Subscription } from "../models/Subscription";
import { asObjectId } from "../utils/auth";

export interface ApiKeyPayload {
  tid: string;
  keyId: string;
  scopes: string[];
}

export interface ApiKeyRequest extends Request {
  apiKey: ApiKeyPayload;
}

/**
 * Hash an API key with Argon2 for secure storage.
 */
export async function hashApiKey(key: string): Promise<string> {
  return argon2.hash(key);
}

/**
 * Authenticate via X-API-Key header. Attaches `req.apiKey` with tenant and scopes.
 * Lookup by prefix, then verify with Argon2.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-api-key"] as string | undefined;
  if (!raw) {
    return res.status(401).json({ error: "api_key_required", message: "X-API-Key header is required" });
  }

  const prefix = raw.slice(0, 12);

  // Prefix-based lookup, then Argon2 verification in code
  ApiKey.find({ prefix, isActive: true })
    .lean()
    .then(async (candidates) => {
      let matched: any = null;
      for (const candidate of candidates) {
        try {
          if (await argon2.verify(candidate.keyHash, raw)) {
            matched = candidate;
            break;
          }
        } catch { /* hash format mismatch, skip */ }
      }

      if (!matched) {
        return res.status(401).json({ error: "invalid_api_key", message: "API key is invalid or revoked" });
      }

      // Check expiry
      if (matched.expiresAt && matched.expiresAt < new Date()) {
        return res.status(401).json({ error: "api_key_expired", message: "API key has expired" });
      }

      // Check plan has API entitlement
      const sub = await Subscription.findOne({ tenantId: matched.tenantId }).lean();
      if (sub && sub.entitlements && !(sub.entitlements as any).api) {
        return res.status(403).json({ error: "api_not_enabled", message: "Your plan does not include API access" });
      }

      // Attach payload
      (req as any).apiKey = {
        tid: String(matched.tenantId),
        keyId: String(matched._id),
        scopes: matched.scopes,
      } satisfies ApiKeyPayload;

      // Set environment header for callers
      res.setHeader("X-TRES-Environment", matched.environment || "production");

      // Update lastUsedAt (fire-and-forget)
      ApiKey.updateOne({ _id: matched._id }, { lastUsedAt: new Date() }).catch(() => {});

      next();
    })
    .catch(() => {
      return res.status(500).json({ error: "internal_error" });
    });
}

/**
 * Check that the API key has the required scope.
 */
export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = (req as ApiKeyRequest).apiKey;
    if (!apiKey) return res.status(401).json({ error: "api_key_required" });
    const hasAll = scopes.every(s => apiKey.scopes.includes(s));
    if (!hasAll) {
      return res.status(403).json({ error: "insufficient_scope", message: `Required scopes: ${scopes.join(", ")}` });
    }
    next();
  };
}
