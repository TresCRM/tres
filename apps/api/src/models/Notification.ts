import mongoose, { Schema, Types } from "mongoose";

export interface NotificationDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

const NotificationSchema = new Schema<NotificationDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    entityType: String,
    entityId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }); // 90 day TTL

export const Notification = mongoose.model<NotificationDoc>("Notification", NotificationSchema);
