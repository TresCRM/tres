import mongoose, { Schema, Types } from "mongoose";

export type ContentType = "PAGE" | "ANNOUNCEMENT" | "POLICY" | "FAQ" | "BLOG" | "CHANGELOG";
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
  publishAt: Date | null;
  meta: {
    title?: string;
    description?: string;
    ogImage?: string;
    canonicalUrl?: string;
    noIndex?: boolean;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<ContentDoc>({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  type: { type: String, enum: ["PAGE", "ANNOUNCEMENT", "POLICY", "FAQ", "BLOG", "CHANGELOG"], required: true },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
  authorId: { type: Schema.Types.ObjectId, required: true, index: true },
  publishedAt: { type: Date, default: null },
  publishAt: { type: Date, default: null },
  meta: {
    type: new Schema(
      {
        title: String,
        description: String,
        ogImage: String,
        canonicalUrl: String,
        noIndex: { type: Boolean, default: false },
      },
      { _id: false, strict: false }
    ),
    default: {},
  },
}, { timestamps: true });

ContentSchema.index({ type: 1, status: 1 });

export const Content = mongoose.model<ContentDoc>("Content", ContentSchema);
