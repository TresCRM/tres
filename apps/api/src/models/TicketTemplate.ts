import mongoose, { Schema, Types } from "mongoose";

export interface TicketTemplateDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  issueType?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  defaultTags?: string[];
  bodyTemplate?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const TicketTemplateSchema = new Schema<TicketTemplateDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    description: String,
    issueType: String,
    priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    defaultTags: [String],
    bodyTemplate: String,
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TicketTemplateSchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });
TicketTemplateSchema.index({ tenantId: 1, issueType: 1 });

export const TicketTemplate = mongoose.model<TicketTemplateDoc>("TicketTemplate", TicketTemplateSchema);
