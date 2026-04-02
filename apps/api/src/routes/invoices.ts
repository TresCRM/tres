/**
 * @module routes/invoices
 * Invoice listing and detail for tenant users.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middlewares/auth";
import type { AuthRequest } from "../types/auth";
import { asObjectId } from "../utils/auth";
import { getInvoicesForTenant } from "../billing/invoiceService";
import { Invoice } from "../models/Invoice";

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

// GET /api/v1/invoices — list invoices for current tenant
invoicesRouter.get("/", requirePermission("BILLING_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const query = z.object({
    limit: z.coerce.number().min(1).max(100).default(25),
    cursor: z.string().optional(),
    status: z.enum(["DRAFT", "PAID", "VOID", "OVERDUE"]).optional(),
  }).parse(req.query);

  const result = await getInvoicesForTenant(auth.tid, {
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
  });

  res.json({ data: result.invoices, nextCursor: result.nextCursor });
});

// GET /api/v1/invoices/:id — single invoice detail
invoicesRouter.get("/:id", requirePermission("BILLING_READ"), async (req, res) => {
  const auth = (req as AuthRequest).auth;
  const invoice = await Invoice.findOne({
    _id: asObjectId(req.params.id),
    tenantId: asObjectId(auth.tid),
  }).lean();

  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });
  res.json({ data: invoice });
});
