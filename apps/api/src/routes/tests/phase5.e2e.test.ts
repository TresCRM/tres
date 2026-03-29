/**
 * @module tests/phase5.e2e
 * Phase 5: File Attachments & Storage -- comprehensive test suite.
 * Covers: upload to ticket, upload to comment, list, get, delete,
 * file type validation, size limits, scan status, RBAC.
 */
import request from "supertest";
import * as path from "path";
import { testSetup, testTeardown, seedActiveSubscription } from "../../tests/helpers";
import { User } from "../../models/User";
import { Tenant } from "../../models/Tenant";
import { Ticket } from "../../models/Ticket";
import { Comment } from "../../models/Comment";
import { Attachment } from "../../models/Attachment";
import { hashPassword, signAccessToken } from "../../utils/auth";
import type { Role } from "../../../../../packages/types/src/roles";

let app: any;

beforeAll(async () => {
  app = await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function setup(slug: string, roles: Role[] = ["OWNER"]) {
  const tenant = await Tenant.create({ slug, branding: { name: `${slug} Co` }, plan: "COMPANY", seats: 20 });
  const user = await User.create({
    tenantId: tenant._id, firstName: "Test", lastName: "User",
    email: `${slug}@test.local`, passwordHash: await hashPassword("TestPass1"),
    roles, status: "ACTIVE",
  });
  const token = signAccessToken({ sub: String(user._id), tid: String(tenant._id), roles });
  await seedActiveSubscription(String(tenant._id));
  return { tenant, user, token, tid: String(tenant._id), uid: String(user._id) };
}

// Small valid PNG (1x1 pixel)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Small valid PDF header
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");

/* ================================================================== */
/*  1. Upload to Ticket                                                */
/* ================================================================== */

describe("Upload attachment to ticket (Phase 5)", () => {
  let token: string, tid: string, ticketId: string;

  beforeAll(async () => {
    const s = await setup("attach-upload");
    token = s.token; tid = s.tid;

    const res = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Attach test", body: "test", priority: "LOW", customerEmail: "a@t.com" });
    ticketId = res.body.data._id;
  });

  test("upload a PNG file to a ticket", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "screenshot.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data.filename).toBe("screenshot.png");
    expect(res.body.data.mimeType).toBe("image/png");
    expect(res.body.data.size).toBeGreaterThan(0);
    expect(res.body.data.url).toBeTruthy();
    expect(res.body.data._id).toBeTruthy();
  });

  test("upload a PDF file to a ticket", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PDF, { filename: "document.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe("application/pdf");
  });

  test("reject disallowed file type (text/html)", async () => {
    const htmlBuf = Buffer.from("<html><body>evil</body></html>");
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", htmlBuf, { filename: "evil.html", contentType: "text/html" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_file_type");
  });

  test("reject disallowed file type (application/javascript)", async () => {
    const jsBuf = Buffer.from("alert(1)");
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", jsBuf, { filename: "hack.js", contentType: "application/javascript" });
    expect(res.status).toBe(400);
  });

  test("reject upload with no file", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_file");
  });

  test("reject upload to nonexistent ticket", async () => {
    const res = await request(app)
      .post("/api/v1/tickets/000000000000000000000000/attachments")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "test.png", contentType: "image/png" });
    expect(res.status).toBe(404);
  });

  test("scan status is set after upload", async () => {
    // Wait briefly for async scan
    await new Promise(r => setTimeout(r, 200));
    const attachments = await Attachment.find({ ticketId }).lean();
    expect(attachments.length).toBeGreaterThanOrEqual(1);
    // In test mode scanner auto-marks CLEAN
    const scanned = attachments.find(a => a.scanStatus === "CLEAN");
    expect(scanned).toBeTruthy();
  });
});

/* ================================================================== */
/*  2. Upload to Comment                                               */
/* ================================================================== */

describe("Upload attachment to comment (Phase 5)", () => {
  let token: string, tid: string, ticketId: string, commentId: string;

  beforeAll(async () => {
    const s = await setup("attach-comment");
    token = s.token; tid = s.tid;

    const ticketRes = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Comment attach", body: "test", priority: "LOW", customerEmail: "b@t.com" });
    ticketId = ticketRes.body.data._id;

    const commentRes = await request(app).post(`/api/v1/tickets/${ticketId}/reply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Reply with attachment coming" });
    commentId = commentRes.body.data._id;
  });

  test("upload a file to a comment", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments/${commentId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "reply-img.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data.commentId).toBe(commentId);
  });

  test("reject upload to nonexistent comment", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments/000000000000000000000000/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "test.png", contentType: "image/png" });
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  3. List & Get Attachments                                          */
/* ================================================================== */

describe("List and get attachments (Phase 5)", () => {
  let token: string, tid: string, ticketId: string, attachmentId: string;

  beforeAll(async () => {
    const s = await setup("attach-list");
    token = s.token; tid = s.tid;

    const ticketRes = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "List attach", body: "test", priority: "LOW", customerEmail: "c@t.com" });
    ticketId = ticketRes.body.data._id;

    // Upload two files
    const r1 = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "img1.png", contentType: "image/png" });
    attachmentId = r1.body.data._id;

    await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PDF, { filename: "doc.pdf", contentType: "application/pdf" });
  });

  test("list attachments for a ticket", async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  test("get single attachment metadata", async () => {
    const res = await request(app)
      .get(`/api/v1/attachments/${attachmentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBe("img1.png");
    expect(res.body.data.checksum).toBeTruthy();
  });

  test("get nonexistent attachment returns 404", async () => {
    const res = await request(app)
      .get("/api/v1/attachments/000000000000000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  4. Delete Attachment                                               */
/* ================================================================== */

describe("Delete attachment (Phase 5)", () => {
  let token: string, tid: string, ticketId: string, attachmentId: string;

  beforeAll(async () => {
    const s = await setup("attach-delete");
    token = s.token; tid = s.tid;

    const ticketRes = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Del attach", body: "test", priority: "LOW", customerEmail: "d@t.com" });
    ticketId = ticketRes.body.data._id;

    const r = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "delete-me.png", contentType: "image/png" });
    attachmentId = r.body.data._id;
  });

  test("delete an attachment", async () => {
    const res = await request(app)
      .delete(`/api/v1/attachments/${attachmentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("deleted attachment returns 404", async () => {
    const res = await request(app)
      .get(`/api/v1/attachments/${attachmentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("delete nonexistent attachment returns 404", async () => {
    const res = await request(app)
      .delete("/api/v1/attachments/000000000000000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/*  5. RBAC on Attachments                                             */
/* ================================================================== */

describe("Attachment RBAC (Phase 5)", () => {
  let ownerToken: string, readonlyToken: string, ticketId: string;

  beforeAll(async () => {
    const s = await setup("attach-rbac");
    ownerToken = s.token;

    const roUser = await User.create({
      tenantId: s.tenant._id, firstName: "RO", lastName: "U",
      email: "ro@attach.local", passwordHash: await hashPassword("TestPass1"),
      roles: ["READONLY"], status: "ACTIVE",
    });
    readonlyToken = signAccessToken({ sub: String(roUser._id), tid: s.tid, roles: ["READONLY"] });

    const ticketRes = await request(app).post("/api/v1/tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ subject: "RBAC attach", body: "test", priority: "LOW", customerEmail: "e@t.com" });
    ticketId = ticketRes.body.data._id;
  });

  test("READONLY can list attachments (TICKET_READ)", async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${readonlyToken}`);
    expect(res.status).toBe(200);
  });

  test("READONLY cannot upload attachments (no TICKET_CREATE)", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set("Authorization", `Bearer ${readonlyToken}`)
      .attach("file", TINY_PNG, { filename: "blocked.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  test("READONLY cannot delete attachments (no TICKET_UPDATE)", async () => {
    const res = await request(app)
      .delete("/api/v1/attachments/000000000000000000000000")
      .set("Authorization", `Bearer ${readonlyToken}`);
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/*  6. Storage service unit tests                                      */
/* ================================================================== */

describe("Storage service (Phase 5)", () => {
  const { isAllowedMimeType, isWithinSizeLimit } = require("../../services/storage");

  test("allows png, jpeg, jpg, pdf", () => {
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("application/pdf")).toBe(true);
  });

  test("rejects html, js, exe", () => {
    expect(isAllowedMimeType("text/html")).toBe(false);
    expect(isAllowedMimeType("application/javascript")).toBe(false);
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
  });

  test("enforces size limit", () => {
    expect(isWithinSizeLimit(1000)).toBe(true);
    expect(isWithinSizeLimit(10 * 1024 * 1024)).toBe(true);
    expect(isWithinSizeLimit(10 * 1024 * 1024 + 1)).toBe(false);
  });
});
