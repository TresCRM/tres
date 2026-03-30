/**
 * @module middlewares/apiKeyAuth
 * API key authentication for external /ext/* endpoints.
 * Lookup by prefix (first 8 chars), verify SHA-256 hash, enforce scopes.
 */
import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
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

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticate via X-API-Key header. Attaches `req.apiKey` with tenant and scopes.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-api-key"] as string | undefined;
  if (!raw) {
    return res.status(401).json({ error: "api_key_required", message: "X-API-Key header is required" });
  }

  const prefix = raw.slice(0, 8);
  const hash = hashKey(raw);

  ApiKey.findOne({ prefix, keyHash: hash, isActive: true })
    .lean()
    .then(async (key) => {
      if (!key) {
        return res.status(401).json({ error: "invalid_api_key", message: "API key is invalid or revoked" });
      }

      // Check expiry
      if (key.expiresAt && key.expiresAt < new Date()) {
        return res.status(401).json({ error: "api_key_expired", message: "API key has expired" });
      }

      // Check plan has API entitlement
      const sub = await Subscription.findOne({ tenantId: key.tenantId }).lean();
      if (sub && sub.entitlements && !(sub.entitlements as any).api) {
        return res.status(403).json({ error: "api_not_enabled", message: "Your plan does not include API access" });
      }

      // Attach payload
      (req as any).apiKey = {
        tid: String(key.tenantId),
        keyId: String(key._id),
        scopes: key.scopes,
      } satisfies ApiKeyPayload;

      // Update lastUsedAt (fire-and-forget)
      ApiKey.updateOne({ _id: key._id }, { lastUsedAt: new Date() }).catch(() => {});

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
