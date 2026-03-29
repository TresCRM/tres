import mongoose, { Schema, Types } from "mongoose";

export interface DomainEventDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  type: string;
  payload: Record<string, any>;
  actorId?: Types.ObjectId;
  createdAt: Date;
}

const DomainEventSchema = new Schema<DomainEventDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  type: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

DomainEventSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
DomainEventSchema.index({ tenantId: 1, createdAt: -1 });
// 90-day TTL for event store cleanup
DomainEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const DomainEvent = mongoose.model<DomainEventDoc>("DomainEvent", DomainEventSchema);
