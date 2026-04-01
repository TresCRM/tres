import mongoose, { Schema, Types } from "mongoose";

export type ContentType = "PAGE" | "ANNOUNCEMENT" | "POLICY" | "FAQ";
export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ContentDoc {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  body: string;
  type: ContentType;
  status: ContentStatus;
  authorId: Types.ObjectId;
  publishedAt: Date | null;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<ContentDoc>({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  type: { type: String, enum: ["PAGE", "ANNOUNCEMENT", "POLICY", "FAQ"], required: true },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
  authorId: { type: Schema.Types.ObjectId, required: true, index: true },
  publishedAt: { type: Date, default: null },
  meta: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ContentSchema.index({ type: 1, status: 1 });

export const Content = mongoose.model<ContentDoc>("Content", ContentSchema);
