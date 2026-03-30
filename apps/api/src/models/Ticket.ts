import mongoose, { Schema, Types } from "mongoose";
export type TicketStatus = "ACTIVE"|"CLOSED"|"REOPENED";

export interface TicketDoc {
  _id: Types.ObjectId; tenantId: Types.ObjectId;
  subject: string; body: string; status: TicketStatus;
  priority?: "LOW"|"MEDIUM"|"HIGH"; assigneeId?: Types.ObjectId;
  customerEmail?: string; tags?: string[];
  createdBy: Types.ObjectId; createdAt: Date; updatedAt: Date;
  requestId?: string;            
  watchers?: string[];
  assignmentHistory?: { assigneeId: Types.ObjectId; assignedAt: Date; reassignedAt?: Date }[];
}
const TicketSchema = new Schema<TicketDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref:"Tenant", required: true },
  subject: { type:String, required:true }, body: { type:String, required:true },
  status: { type:String, enum:["ACTIVE","CLOSED","REOPENED"], default:"ACTIVE" },
  priority: { type:String, enum:["LOW","MEDIUM","HIGH"], default:"LOW" },
  assigneeId: { type: Schema.Types.ObjectId, ref:"User" },
  customerEmail: String, tags: [String],
  createdBy: { type: Schema.Types.ObjectId, ref:"User", required:true },
  requestId: { type: String, index: true, default: undefined },
  watchers: [String],
  assignmentHistory: { type: [{ assigneeId: Schema.Types.ObjectId, assignedAt: Date, reassignedAt: Date }], default: [] },
}, { timestamps: true });

TicketSchema.index({ createdAt: -1 });
TicketSchema.index({status: 1, priority: 1, createdAt: -1 });
TicketSchema.index(
  { tenantId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } }
);

export const Ticket = mongoose.model<TicketDoc>("Ticket", TicketSchema);
