/**
 * @module routes/imagekit
 * Server-side ImageKit authentication for client uploads.
 *
 * ImageKit requires signed auth params (token, expire, signature) generated
 * using the private key. The client calls GET /api/v1/imagekit/auth, receives
 * the params, then uploads directly to ImageKit's upload API.
 *
 * Flow:
 *  1. Client: GET /api/v1/imagekit/auth → receives { token, expire, signature, publicKey, urlEndpoint }
 *  2. Client: POST https://upload.imagekit.io/api/v1/files/upload with file + auth params
 *  3. ImageKit returns { url, fileId, name, ... }
 */
import { Router } from "express";
import crypto from "crypto";
import { ENV } from "../config/env";

export const imagekitRouter = Router();

// GET /api/v1/imagekit/auth — generate signed upload credentials
imagekitRouter.get("/auth", (_req, res) => {
  const privateKey = ENV.IMAGEKIT_PRIVATE_KEY;
  const publicKey = ENV.IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = ENV.IMAGEKIT_URL_ENDPOINT;

  if (!privateKey || !publicKey) {
    return res.status(503).json({ error: "imagekit_not_configured" });
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 600; // 10 minutes
  const signature = crypto
    .createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  res.json({
    token,
    expire,
    signature,
    publicKey,
    urlEndpoint,
  });
});
