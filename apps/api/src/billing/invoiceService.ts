import crypto from "node:crypto";
import { Types, type FilterQuery } from "mongoose";
import { Invoice, type InvoiceDoc } from "../models/Invoice";
import { getPlanByCode, priceForInterval, type Interval, type PlanCode } from "./plans";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTERVAL_LABELS: Record<Interval, string> = {
  MONTH: "Monthly",
  QUARTER: "Quarterly",
  SEMIANNUAL: "Semi-Annual",
  ANNUAL: "Annual",
};

/**
 * Generate a unique invoice number in the format `INV-{YYYYMMDD}-{6 hex}`.
 */
export function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hex = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  return `INV-${y}${m}${d}-${hex}`;
}

// ---------------------------------------------------------------------------
// Create invoice
// ---------------------------------------------------------------------------

export interface CreateInvoiceParams {
  tenantId: Types.ObjectId | string;
  subscriptionId: Types.ObjectId | string;
  planCode: PlanCode | string;
  interval: Interval;
  currency?: string;
  /**
   * Payment-provider transaction reference. When supplied, the invoice is
   * unique per reference: a repeated call for the same transaction returns the
   * existing invoice instead of raising a duplicate.
   */
  providerReference?: string;
}

/**
 * Create a DRAFT invoice for a subscription renewal.
 *
 * Resolves pricing from the plan catalog, builds a single line item, and
 * persists the invoice document.
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<InvoiceDoc> {
  const { tenantId, subscriptionId, planCode, interval, currency = "USD", providerReference } = params;

  // One invoice per provider transaction. A webhook can be delivered more than
  // once, and each delivery would otherwise bill the tenant again.
  if (providerReference) {
    const existing = await Invoice.findOne({ providerReference }).lean();
    if (existing) return existing as InvoiceDoc;
  }

  const plan = getPlanByCode(planCode);
  if (!plan) {
    throw new Error(`Unknown or inactive plan code: ${planCode}`);
  }

  const totalCents = priceForInterval(plan, interval);
  const description = `${plan.name} - ${INTERVAL_LABELS[interval]} subscription`;

  const invoice = await Invoice.create({
    tenantId: new Types.ObjectId(tenantId),
    subscriptionId: new Types.ObjectId(subscriptionId),
    invoiceNumber: generateInvoiceNumber(),
    status: "DRAFT",
    currency,
    subtotalCents: totalCents,
    taxCents: 0,
    totalCents,
    items: [
      {
        description,
        quantity: 1,
        unitPriceCents: totalCents,
        totalCents,
      },
    ],
    providerReference,
  });

  return invoice;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Mark an invoice as PAID and record the payment timestamp.
 */
export async function markInvoicePaid(invoiceId: Types.ObjectId | string): Promise<InvoiceDoc> {
  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: { status: "PAID", paidAt: new Date() } },
    { new: true },
  );

  if (!invoice) {
    throw new Error(`Invoice not found: ${String(invoiceId)}`);
  }

  return invoice;
}

/**
 * Mark an invoice as VOID.
 */
export async function markInvoiceVoid(invoiceId: Types.ObjectId | string): Promise<InvoiceDoc> {
  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: { status: "VOID" } },
    { new: true },
  );

  if (!invoice) {
    throw new Error(`Invoice not found: ${String(invoiceId)}`);
  }

  return invoice;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface GetInvoicesParams {
  /** Pass the `_id` of the last document from the previous page. */
  cursor?: string;
  limit?: number;
  status?: InvoiceDoc["status"];
}

export interface GetInvoicesResult {
  invoices: InvoiceDoc[];
  nextCursor: string | null;
}

/**
 * List invoices for a tenant with cursor-based pagination and optional status
 * filter.  Results are ordered newest-first (`createdAt` descending).
 */
export async function getInvoicesForTenant(
  tenantId: Types.ObjectId | string,
  params: GetInvoicesParams = {},
): Promise<GetInvoicesResult> {
  const { cursor, limit = 25, status } = params;

  const filter: FilterQuery<InvoiceDoc> = {
    tenantId: new Types.ObjectId(tenantId),
  };

  if (status) {
    filter.status = status;
  }

  if (cursor) {
    filter._id = { $lt: new Types.ObjectId(cursor) };
  }

  const invoices = await Invoice.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean<InvoiceDoc[]>();

  const hasMore = invoices.length > limit;
  if (hasMore) {
    invoices.pop();
  }

  const nextCursor = hasMore ? String(invoices[invoices.length - 1]._id) : null;

  return { invoices, nextCursor };
}
