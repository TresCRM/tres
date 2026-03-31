/**
 * @module utils/fieldEncryption
 * AES-256-GCM field-level encryption for PII at rest.
 * Each encrypted value includes a random IV + auth tag, so identical plaintext
 * produces different ciphertext (no deterministic matching).
 *
 * Format: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    // In test/dev without a key, encryption is a no-op (passthrough)
    return Buffer.alloc(0);
  }
  if (raw.length !== 64) {
    throw new Error("[fieldEncryption] FIELD_ENCRYPTION_KEY must be a 64-char hex string (256 bits)");
  }
  _key = Buffer.from(raw, "hex");
  return _key;
}

/** Returns true if field encryption is configured */
export function isEncryptionEnabled(): boolean {
  return !!process.env.FIELD_ENCRYPTION_KEY;
}

/** Encrypt a plaintext string. Returns prefixed ciphertext or original if encryption disabled. */
export function encryptField(plaintext: string): string {
  if (!plaintext || !isEncryptionEnabled()) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted

  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a ciphertext string. Returns plaintext or original if not encrypted. */
export function decryptField(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith(PREFIX)) return ciphertext;
  if (!isEncryptionEnabled()) return ciphertext; // can't decrypt without key

  try {
    const parts = ciphertext.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return ciphertext;
    const [ivHex, authTagHex, dataHex] = parts;

    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    return ciphertext; // decryption failed — return as-is
  }
}

/**
 * Mongoose plugin: encrypts specified fields on save, decrypts on find.
 * Usage: schema.plugin(fieldEncryptionPlugin, { fields: ['email', 'phone'] });
 */
export function fieldEncryptionPlugin(schema: any, opts: { fields: string[] }) {
  const { fields } = opts;

  // Encrypt on save
  schema.pre("save", function (this: any, next: any) {
    for (const field of fields) {
      const val = this[field];
      if (val && typeof val === "string" && !val.startsWith(PREFIX)) {
        this[field] = encryptField(val);
      }
    }
    next();
  });

  // Decrypt after find operations
  function decryptDoc(doc: any) {
    if (!doc) return doc;
    for (const field of fields) {
      if (doc[field] && typeof doc[field] === "string" && doc[field].startsWith(PREFIX)) {
        doc[field] = decryptField(doc[field]);
      }
    }
    return doc;
  }

  schema.post("find", function (docs: any[]) {
    if (Array.isArray(docs)) docs.forEach(decryptDoc);
  });
  schema.post("findOne", function (doc: any) { decryptDoc(doc); });
  schema.post("findOneAndUpdate", function (doc: any) { decryptDoc(doc); });

  // Also encrypt on update operations
  for (const method of ["updateOne", "updateMany", "findOneAndUpdate"] as const) {
    schema.pre(method, function (this: any, next: any) {
      const update = this.getUpdate?.();
      if (!update) return next();
      const $set = update.$set || update;
      for (const field of fields) {
        if ($set[field] && typeof $set[field] === "string" && !$set[field].startsWith(PREFIX)) {
          $set[field] = encryptField($set[field]);
        }
      }
      next();
    });
  }
}
