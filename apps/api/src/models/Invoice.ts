import mongoose, { Schema, Types } from "mongoose";

export interface InvoiceItemDoc {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface InvoiceDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  invoiceNumber: string;
  status: "DRAFT" | "PAID" | "VOID" | "OVERDUE";
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  items: InvoiceItemDoc[];
  paidAt?: Date;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema<InvoiceItemDoc>({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPriceCents: { type: Number, required: true },
  totalCents: { type: Number, required: true },
}, { _id: false });

const InvoiceSchema = new Schema<InvoiceDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
  invoiceNumber: { type: String, required: true, unique: true },
  status: { type: String, enum: ["DRAFT", "PAID", "VOID", "OVERDUE"], default: "DRAFT" },
  currency: { type: String, default: "USD", maxlength: 3 },
  subtotalCents: { type: Number, required: true },
  taxCents: { type: Number, default: 0 },
  totalCents: { type: Number, required: true },
  items: { type: [InvoiceItemSchema], default: [] },
  paidAt: Date,
  dueDate: Date,
}, { timestamps: true, versionKey: false });

InvoiceSchema.index({ tenantId: 1, createdAt: -1 });
InvoiceSchema.index({ tenantId: 1, status: 1 });

export const Invoice = mongoose.model<InvoiceDoc>("Invoice", InvoiceSchema);
