/**
 * @module tests/utils.fieldEncryption
 * Unit tests for AES-256-GCM field-level encryption of PII at rest.
 *
 * The module caches the key on first use and reads it from the environment,
 * so each block sets the env and re-requires the module through
 * `jest.isolateModules` to get a clean instance.
 */
import mongoose, { Schema } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";

type FieldEncryption = typeof import("../../utils/fieldEncryption");

const KEY_A = "a1".repeat(32); // 64 hex chars = 256 bits
const KEY_B = "b2".repeat(32);
const PREFIX = "enc:v1:";

const originalKey = process.env.FIELD_ENCRYPTION_KEY;

/** Load a fresh copy of the module with FIELD_ENCRYPTION_KEY set to `key`. */
function loadWithKey(key: string | undefined): FieldEncryption {
  if (key === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = key;

  let mod!: FieldEncryption;
  jest.isolateModules(() => {
    mod = require("../../utils/fieldEncryption");
  });
  return mod;
}

afterAll(() => {
  if (originalKey === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = originalKey;
});

describe("fieldEncryption — disabled (no key configured)", () => {
  let fe: FieldEncryption;
  beforeAll(() => {
    fe = loadWithKey(undefined);
  });

  test("reports encryption as disabled", () => {
    expect(fe.isEncryptionEnabled()).toBe(false);
  });

  test("encryptField passes plaintext straight through", () => {
    expect(fe.encryptField("ada@example.com")).toBe("ada@example.com");
  });

  test("decryptField leaves ciphertext untouched — it has no key", () => {
    const ciphertext = `${PREFIX}aa:bb:cc`;
    expect(fe.decryptField(ciphertext)).toBe(ciphertext);
  });
});

describe("fieldEncryption — enabled", () => {
  let fe: FieldEncryption;
  beforeAll(() => {
    fe = loadWithKey(KEY_A);
  });

  test("reports encryption as enabled", () => {
    expect(fe.isEncryptionEnabled()).toBe(true);
  });

  test("round-trips a value", () => {
    const plaintext = "ada@example.com";
    const ciphertext = fe.encryptField(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(fe.decryptField(ciphertext)).toBe(plaintext);
  });

  test("emits the documented enc:v1 envelope", () => {
    const parts = fe.encryptField("secret").slice(PREFIX.length).split(":");
    expect(parts).toHaveLength(3);
    const [iv, authTag, data] = parts;
    expect(iv).toHaveLength(24); // 12-byte IV
    expect(authTag).toHaveLength(32); // 16-byte GCM tag
    expect(data.length).toBeGreaterThan(0);
  });

  test("is non-deterministic — the same input yields different ciphertext", () => {
    const a = fe.encryptField("same value");
    const b = fe.encryptField("same value");
    expect(a).not.toBe(b);
    expect(fe.decryptField(a)).toBe("same value");
    expect(fe.decryptField(b)).toBe("same value");
  });

  test("does not double-encrypt an already-encrypted value", () => {
    const once = fe.encryptField("secret");
    expect(fe.encryptField(once)).toBe(once);
  });

  test("passes empty input through untouched", () => {
    expect(fe.encryptField("")).toBe("");
    expect(fe.decryptField("")).toBe("");
  });

  test("round-trips unicode and long values", () => {
    const plaintext = `héllo wörld ${"x".repeat(500)} 🎫`;
    expect(fe.decryptField(fe.encryptField(plaintext))).toBe(plaintext);
  });

  test("leaves unprefixed values alone on decrypt", () => {
    expect(fe.decryptField("plain text")).toBe("plain text");
  });

  test("returns the input when the envelope has the wrong shape", () => {
    const malformed = `${PREFIX}onlyonepart`;
    expect(fe.decryptField(malformed)).toBe(malformed);
  });

  test("returns the input when the auth tag does not verify", () => {
    const ciphertext = fe.encryptField("secret");
    const [iv, , data] = ciphertext.slice(PREFIX.length).split(":");
    const tampered = `${PREFIX}${iv}:${"0".repeat(32)}:${data}`;
    expect(fe.decryptField(tampered)).toBe(tampered);
  });

  test("returns the input when the ciphertext body was tampered with", () => {
    const ciphertext = fe.encryptField("secret");
    const [iv, tag, data] = ciphertext.slice(PREFIX.length).split(":");
    const flipped = data.startsWith("0") ? `1${data.slice(1)}` : `0${data.slice(1)}`;
    const tampered = `${PREFIX}${iv}:${tag}:${flipped}`;
    expect(fe.decryptField(tampered)).toBe(tampered);
  });

  test("a value encrypted under one key does not decrypt under another", () => {
    const ciphertext = fe.encryptField("secret");
    const other = loadWithKey(KEY_B);
    expect(other.decryptField(ciphertext)).toBe(ciphertext);
    // Restore this block's key for any later assertions.
    loadWithKey(KEY_A);
  });
});

describe("fieldEncryption — key validation", () => {
  test("rejects a key that is not 64 hex characters", () => {
    const fe = loadWithKey("tooshort");
    expect(() => fe.encryptField("secret")).toThrow(/64-char hex string/);
  });
});

describe("fieldEncryption — mongoose plugin", () => {
  let fe: FieldEncryption;
  let Model: mongoose.Model<any>;

  beforeAll(async () => {
    await testSetup();
    fe = loadWithKey(KEY_A);

    const schema = new Schema({ label: String, email: String, phone: String });
    schema.plugin(fe.fieldEncryptionPlugin, { fields: ["email", "phone"] });
    Model = mongoose.model("FieldEncryptionFixture", schema);
  });

  afterAll(async () => {
    await testTeardown();
  });

  afterEach(async () => {
    await Model.deleteMany({});
  });

  /** Read the raw stored document, bypassing the decrypting post-hooks. */
  async function raw(id: any) {
    return Model.collection.findOne({ _id: id });
  }

  test("encrypts the configured fields on save", async () => {
    const doc = await Model.create({
      label: "customer",
      email: "ada@example.com",
      phone: "+254700000000",
    });

    const stored = await raw(doc._id);
    expect(stored!.email.startsWith(PREFIX)).toBe(true);
    expect(stored!.phone.startsWith(PREFIX)).toBe(true);
    expect(fe.decryptField(stored!.email)).toBe("ada@example.com");
  });

  test("leaves unconfigured fields in the clear", async () => {
    const doc = await Model.create({ label: "customer", email: "ada@example.com" });

    expect((await raw(doc._id))!.label).toBe("customer");
  });

  test("decrypts on findOne", async () => {
    const doc = await Model.create({ email: "ada@example.com" });

    expect((await Model.findOne({ _id: doc._id }))!.email).toBe("ada@example.com");
  });

  test("decrypts on find", async () => {
    await Model.create({ email: "ada@example.com" });
    await Model.create({ email: "grace@example.com" });

    const emails = (await Model.find({})).map((d: any) => d.email).sort();
    expect(emails).toEqual(["ada@example.com", "grace@example.com"]);
  });

  test("encrypts on updateOne", async () => {
    const doc = await Model.create({ email: "ada@example.com" });

    await Model.updateOne({ _id: doc._id }, { $set: { email: "new@example.com" } });

    const stored = await raw(doc._id);
    expect(stored!.email.startsWith(PREFIX)).toBe(true);
    expect(fe.decryptField(stored!.email)).toBe("new@example.com");
  });

  test("encrypts on findOneAndUpdate and returns plaintext", async () => {
    const doc = await Model.create({ email: "ada@example.com" });

    const updated = await Model.findOneAndUpdate(
      { _id: doc._id },
      { $set: { email: "next@example.com" } },
      { new: true }
    );

    expect(updated!.email).toBe("next@example.com");
    expect((await raw(doc._id))!.email.startsWith(PREFIX)).toBe(true);
  });

  test("encrypts on updateMany", async () => {
    await Model.create({ label: "bulk", email: "a@example.com" });
    await Model.create({ label: "bulk", email: "b@example.com" });

    await Model.updateMany({ label: "bulk" }, { $set: { email: "same@example.com" } });

    const stored = await Model.collection.find({ label: "bulk" }).toArray();
    for (const d of stored) {
      expect(d.email.startsWith(PREFIX)).toBe(true);
    }
  });

  test("does not re-encrypt a value that is already ciphertext", async () => {
    const ciphertext = fe.encryptField("ada@example.com");
    const doc = await Model.create({ email: ciphertext });

    expect((await raw(doc._id))!.email).toBe(ciphertext);
  });

  test("tolerates documents with the encrypted fields absent", async () => {
    const doc = await Model.create({ label: "no pii" });

    const found = await Model.findOne({ _id: doc._id });
    expect(found!.email).toBeUndefined();
  });

  test("tolerates an update that touches no encrypted field", async () => {
    const doc = await Model.create({ label: "before", email: "ada@example.com" });

    await Model.updateOne({ _id: doc._id }, { $set: { label: "after" } });

    const found = await Model.findOne({ _id: doc._id });
    expect(found!.label).toBe("after");
    expect(found!.email).toBe("ada@example.com");
  });

  test("findOne on a missing document is a no-op for the hook", async () => {
    expect(await Model.findOne({ label: "nope" })).toBeNull();
  });
});
