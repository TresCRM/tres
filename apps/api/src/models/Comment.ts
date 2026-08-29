import mongoose, { Schema, Types } from "mongoose";
export interface CommentDoc {
  _id: Types.ObjectId; tenantId: Types.ObjectId; ticketId: Types.ObjectId;
  authorId: Types.ObjectId; body: string; isAgent: boolean; isInternal: boolean;
  createdAt: Date;
  requestId?: string;
}
const CommentSchema = new Schema<CommentDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref:"Tenant", index:true, required:true },
  ticketId: { type: Schema.Types.ObjectId, ref:"Ticket", index:true, required:true },
  authorId: { type: Schema.Types.ObjectId, ref:"User", required:true },
  body: { type:String, required:true },
  isAgent: { type:Boolean, default:true },
  isInternal: { type:Boolean, default:false },
  requestId: { type: String, index: true, sparse: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

CommentSchema.index({ tenantId:1, ticketId:1, createdAt:-1 });

export const Comment = mongoose.model<CommentDoc>("Comment", CommentSchema);
