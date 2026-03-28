import mongoose, { Schema } from "mongoose";

const ErrorLogSchema = new Schema({
  tenantId:   { type: Schema.Types.ObjectId, required: false },
  actorId:    { type: Schema.Types.ObjectId, index: true, required: false },
  roles:      { type: [String], default: [] },

  requestId:  { type: String, index: true },
  route:      { type: String, index: true },
  method:     { type: String, index: true },

  http:       { type: Number, index: true },
  code:       { type: String },
  message:    { type: String },
  details:    { type: Object },

  stack:      { type: String },

  ip:         { type: String },
  ua:         { type: String },

  createdAt:  { type: Date, default: Date.now },
}, { versionKey: false });



// TTL
const ttlDays = Number(process.env.ERROR_LOG_TTL_DAYS || 60);
if (ttlDays > 0) {
  ErrorLogSchema.index({ tenantId: 1, code: 1 });
  ErrorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlDays * 86400 });
}else{
  ErrorLogSchema.index({ code: 1, createdAt: -1 });
}

export const ErrorLog = mongoose.model("ErrorLog", ErrorLogSchema, "error_logs");
