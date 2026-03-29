/**
 * @module routes/attachments
 * File attachment upload, download, and management for tickets and comments.
 * PRD: supports png, jpeg, jpg, pdf. Max 10MB. AV scan on upload.
 */
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { Attachment } from "../models/Attachment";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { storeFile, deleteFile, isAllowedMimeType } from "../services/storage";
import { scanAttachment } from "../services/scanner";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const attachmentsRouter = Router();

// Multer: memory storage (buffer), 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Allowed: png, jpeg, jpg, pdf`));
    }
  },
});

/* ---------- OpenAPI ---------- */

registry.registerPath({
  tags: ["Attachments"],
  method: "post",
  path: "/api/v1/tickets/{ticketId}/attachments",
  description: "Upload a file attachment to a ticket. Max 10MB. Allowed: png, jpeg, jpg, pdf.",
  request: { params: z.object({ ticketId: z.string() }) },
  responses: {
    201: { description: "Uploaded" },
    400: { description: "Invalid file type or too large" },
    404: { description: "Ticket not found" },
  },
});

registry.registerPath({
  tags: ["Attachments"],
  method: "get",
  path: "/api/v1/attachments/{id}",
  description: "Get attachment metadata and download URL.",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
});

registry.registerPath({
  tags: ["Attachments"],
  method: "get",
  path: "/api/v1/tickets/{ticketId}/attachments",
  description: "List all attachments for a ticket.",
  request: { params: z.object({ ticketId: z.string() }) },
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  tags: ["Attachments"],
  method: "delete",
  path: "/api/v1/attachments/{id}",
  description: "Delete an attachment. Requires TICKET_UPDATE permission.",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
});

/* ---------- Routes ---------- */

// POST upload to ticket
attachmentsRouter.post(
  "/tickets/:ticketId/attachments",
  requireAuth,
  requirePermission("TICKET_CREATE"),
  upload.single("file"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const ticketId = req.params.ticketId;

    try {
      // Verify ticket belongs to tenant
      const ticket = await Ticket.findOne({
        _id: asObjectId(ticketId),
        tenantId: asObjectId(auth.tid),
      });
      if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "no_file", message: "No file uploaded" });

      // Store file
      const stored = await storeFile(file.buffer, file.originalname, file.mimetype, auth.tid);

      // Create attachment record
      const attachment = await Attachment.create({
        tenantId: asObjectId(auth.tid),
        ticketId: asObjectId(ticketId),
        url: stored.url,
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
        checksum: stored.checksum,
        scanStatus: "PENDING",
        uploadedBy: asObjectId(auth.sub),
      });

      // Trigger async scan (fire-and-forget in non-test)
      scanAttachment(String(attachment._id)).catch(() => {});

      return res.status(201).json({
        data: {
          _id: attachment._id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          scanStatus: attachment.scanStatus,
          url: attachment.url,
        },
      });
    } catch (e: any) {
      if (e.message?.includes("File type not allowed")) {
        return res.status(400).json({ error: "invalid_file_type", message: e.message });
      }
      if (e.message?.includes("File too large")) {
        return res.status(400).json({ error: "file_too_large", message: e.message });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// POST upload to comment
attachmentsRouter.post(
  "/tickets/:ticketId/comments/:commentId/attachments",
  requireAuth,
  requirePermission("COMMENT_CREATE"),
  upload.single("file"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const { ticketId, commentId } = req.params;

    try {
      const ticket = await Ticket.findOne({
        _id: asObjectId(ticketId),
        tenantId: asObjectId(auth.tid),
      });
      if (!ticket) return res.status(404).json({ error: "ticket_not_found" });

      const comment = await Comment.findOne({
        _id: asObjectId(commentId),
        ticketId: asObjectId(ticketId),
      });
      if (!comment) return res.status(404).json({ error: "comment_not_found" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "no_file" });

      const stored = await storeFile(file.buffer, file.originalname, file.mimetype, auth.tid);

      const attachment = await Attachment.create({
        tenantId: asObjectId(auth.tid),
        ticketId: asObjectId(ticketId),
        commentId: asObjectId(commentId),
        url: stored.url,
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
        checksum: stored.checksum,
        scanStatus: "PENDING",
        uploadedBy: asObjectId(auth.sub),
      });

      scanAttachment(String(attachment._id)).catch(() => {});

      return res.status(201).json({ data: attachment });
    } catch (e: any) {
      if (e.message?.includes("File type not allowed")) {
        return res.status(400).json({ error: "invalid_file_type", message: e.message });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// GET list attachments for a ticket
attachmentsRouter.get(
  "/tickets/:ticketId/attachments",
  requireAuth,
  requirePermission("TICKET_READ"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const attachments = await Attachment.find({
      tenantId: asObjectId(auth.tid),
      ticketId: asObjectId(req.params.ticketId),
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: attachments });
  }
);

// GET single attachment metadata
attachmentsRouter.get(
  "/attachments/:id",
  requireAuth,
  requirePermission("TICKET_READ"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const attachment = await Attachment.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    }).lean();
    if (!attachment) return res.status(404).json({ error: "not_found" });
    res.json({ data: attachment });
  }
);

// DELETE attachment
attachmentsRouter.delete(
  "/attachments/:id",
  requireAuth,
  requirePermission("TICKET_UPDATE"),
  async (req, res) => {
    const auth = (req as AuthRequest).auth;
    const attachment = await Attachment.findOne({
      _id: asObjectId(req.params.id),
      tenantId: asObjectId(auth.tid),
    });
    if (!attachment) return res.status(404).json({ error: "not_found" });

    // Delete from storage
    try {
      await deleteFile(attachment.url);
    } catch {
      // storage delete is best-effort
    }

    await Attachment.deleteOne({ _id: attachment._id });
    res.json({ ok: true });
  }
);

// Multer error handler
attachmentsRouter.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "file_too_large", message: "File exceeds 10MB limit" });
    }
    return res.status(400).json({ error: "upload_error", message: err.message });
  }
  if (err?.message?.includes("File type not allowed")) {
    return res.status(400).json({ error: "invalid_file_type", message: err.message });
  }
  next(err);
});
