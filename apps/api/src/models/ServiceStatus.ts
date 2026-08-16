import mongoose, { Schema, Types } from "mongoose";

export type OverallStatus = "OPERATIONAL" | "DEGRADED" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "MAINTENANCE";

export interface IncidentUpdate {
  message: string;
  status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
  createdAt: Date;
}

export interface Incident {
  title: string;
  status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
  updates: IncidentUpdate[];
  startedAt: Date;
  resolvedAt?: Date;
}

export interface ServiceStatusDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  status: OverallStatus;
  title: string;
  message?: string;
  components: { name: string; status: "OPERATIONAL" | "DEGRADED" | "DOWN" }[];
  incidents: Incident[];
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentUpdateSchema = new Schema<IncidentUpdate>({
  message: { type: String, required: true },
  status: { type: String, enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"], required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const IncidentSchema = new Schema<Incident>({
  title: { type: String, required: true },
  status: { type: String, enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"], default: "INVESTIGATING" },
  updates: { type: [IncidentUpdateSchema], default: [] },
  startedAt: { type: Date, default: Date.now },
  resolvedAt: Date,
}, { _id: false });

const ComponentSchema = new Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ["OPERATIONAL", "DEGRADED", "DOWN"], default: "OPERATIONAL" },
}, { _id: false });

const ServiceStatusSchema = new Schema<ServiceStatusDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
  status: { type: String, enum: ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"], default: "OPERATIONAL" },
  title: { type: String, default: "All Systems Operational" },
  message: String,
  components: { type: [ComponentSchema], default: [] },
  incidents: { type: [IncidentSchema], default: [] },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

ServiceStatusSchema.index({ tenantId: 1 }, { unique: true });

export const ServiceStatus = mongoose.model<ServiceStatusDoc>("ServiceStatus", ServiceStatusSchema);
