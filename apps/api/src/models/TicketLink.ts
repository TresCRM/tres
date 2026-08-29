import mongoose, { Schema, Types } from "mongoose";

export type LinkRelationship = "related" | "parent" | "child" | "blocked_by" | "blocks" | "duplicate";

export interface TicketLinkDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  sourceTicketId: Types.ObjectId;
  targetTicketId: Types.ObjectId;
  relationship: LinkRelationship;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const TicketLinkSchema = new Schema<TicketLinkDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    sourceTicketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
    targetTicketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
    relationship: {
      type: String,
      enum: ["related", "parent", "child", "blocked_by", "blocks", "duplicate"],
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TicketLinkSchema.index({ tenantId: 1, sourceTicketId: 1, targetTicketId: 1 }, { unique: true });
TicketLinkSchema.index({ tenantId: 1, sourceTicketId: 1 });
TicketLinkSchema.index({ tenantId: 1, targetTicketId: 1 });

export const TicketLink = mongoose.model<TicketLinkDoc>("TicketLink", TicketLinkSchema);
