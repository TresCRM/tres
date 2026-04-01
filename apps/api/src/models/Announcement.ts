import mongoose, { Schema, Types } from "mongoose";

export type AnnouncementLevel = "INFO" | "WARNING" | "CRITICAL";

export interface AnnouncementDoc {
  _id: Types.ObjectId;
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: Date;
  endsAt: Date | null;
  targetRoles: string[];
  isActive: boolean;
  authorId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<AnnouncementDoc>({
  title: { type: String, required: true },
  body: { type: String, default: "" },
  level: { type: String, enum: ["INFO", "WARNING", "CRITICAL"], default: "INFO" },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, default: null },
  targetRoles: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  authorId: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true });

AnnouncementSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

export const Announcement = mongoose.model<AnnouncementDoc>("Announcement", AnnouncementSchema);
