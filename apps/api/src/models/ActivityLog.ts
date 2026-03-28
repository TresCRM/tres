import mongoose, { Schema, Types } from "mongoose";

export type Level = "INFO"|"WARN"|"ERROR"|"AUDIT";
export interface ActivityLogDoc {
  _id: Types.ObjectId;
  tenantId?: Types.ObjectId;
  userId?: Types.ObjectId;
  action: string;           // e.g., TICKET_CREATED, LOGIN, ERROR
  resource?: string;        // /api/v1/tickets
  level: Level;
  ip?: string;
  ua?: string;
  route?: string;
  meta?: Record<string, any>;
  createdAt: Date;
}

const ActivityLogSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: false },
  actorId:  { type: Schema.Types.ObjectId, required: false },
  roles:    { type: [String], default: [] },

  method:   { type: String, index: true },
  route:    { type: String, index: true },
  status:   { type: Number, index: true },
  durationMs:{ type: Number, index: true },

  requestId:{ type: String, index: true },
  idempotencyKey: { type: String, index: true },

  ip:       { type: String },
  ua:       { type: String },

  query:    { type: Object },
  body:     { type: Object },

  createdAt:{ type: Date, default: Date.now},
}, { versionKey: false });

// TTL (configurable)
const ttlDays = Number(process.env.ACTIVITY_LOG_TTL_DAYS || 30);
if (ttlDays > 0) {
  ActivityLogSchema.index({tenantId: 1, actorId: 1, route: 1, method: 1, status: 1});
  ActivityLogSchema.index({createdAt: 1}, { expireAfterSeconds: ttlDays * 86400 });
}else{
  ActivityLogSchema.index({ tenantId: 1, actorId: 1, route: 1, method: 1, status: 1, createdAt: -1 });
}

export const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema, "activity_logs");
