/**
 * @module services/storage
 * File storage abstraction. Local disk in dev, S3-compatible in production.
 * Validates file types (PRD: png, jpeg, jpg, pdf), enforces size limits, computes checksums.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ENV } from "../config/env";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB default

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "application/pdf": ".pdf",
};

export interface StoredFile {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
}

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}

export function isWithinSizeLimit(size: number, limitBytes = MAX_FILE_SIZE): boolean {
  return size <= limitBytes;
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Store a file buffer to local disk. Returns metadata.
 * In production, replace with S3 putObject or GridFS write.
 */
export async function storeFile(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  tenantId: string,
): Promise<StoredFile> {
  if (!isAllowedMimeType(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}. Allowed: png, jpeg, jpg, pdf`);
  }
  if (!isWithinSizeLimit(buffer.length)) {
    throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE}`);
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const ext = MIME_TO_EXT[mimeType] || path.extname(originalFilename);
  const safeFilename = `${tenantId}_${Date.now()}_${checksum.slice(0, 8)}${ext}`;

  ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, safeFilename);
  fs.writeFileSync(filePath, buffer);

  const url = `/uploads/${safeFilename}`;

  return {
    url,
    filename: originalFilename,
    mimeType,
    size: buffer.length,
    checksum,
  };
}

/**
 * Delete a file from storage by its URL path.
 */
export async function deleteFile(url: string): Promise<void> {
  const filename = path.basename(url);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
