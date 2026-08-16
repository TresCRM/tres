import mongoose, { Schema, Types } from "mongoose";

export interface IdempotencyResultDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  key: string;
  method: string;
  path: string;
  statusCode: number;
  body: any;
  createdAt: Date;
}

const IdempotencyResultSchema = new Schema<IdempotencyResultDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  key: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  statusCode: { type: Number, required: true },
  body: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });

IdempotencyResultSchema.index({ tenantId: 1, key: 1 }, { unique: true });
IdempotencyResultSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL

export const IdempotencyResult = mongoose.model<IdempotencyResultDoc>("IdempotencyResult", IdempotencyResultSchema);
