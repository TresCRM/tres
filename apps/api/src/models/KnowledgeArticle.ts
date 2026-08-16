import mongoose, { Schema, Types } from "mongoose";

export interface KnowledgeArticleDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  category: string;
  body: string;
  status: "AI_DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  source: "ai_extracted" | "manual";
  sourceTicketIds: Types.ObjectId[];
  publishedAt?: Date;
  viewCount: number;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeArticleSchema = new Schema<KnowledgeArticleDoc>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ["AI_DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"], default: "AI_DRAFT" },
    source: { type: String, enum: ["ai_extracted", "manual"], default: "manual" },
    sourceTicketIds: [{ type: Schema.Types.ObjectId, ref: "Ticket" }],
    publishedAt: Date,
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

KnowledgeArticleSchema.index({ tenantId: 1, status: 1, category: 1 });
KnowledgeArticleSchema.index({ tenantId: 1, title: "text", body: "text" });

export const KnowledgeArticle = mongoose.model<KnowledgeArticleDoc>("KnowledgeArticle", KnowledgeArticleSchema);
