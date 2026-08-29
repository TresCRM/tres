import mongoose, { Schema, Types } from "mongoose";

export interface IssueTypeEntry {
  name: string;
  description: string;
  defaultPriority: string;
}

export interface ResponseTemplateEntry {
  name: string;
  subject: string;
  body: string;
  issueType: string;
}

export interface SlaTargets {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export interface IndustryPackDoc {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  icon: string;
  issueTypes: IssueTypeEntry[];
  responseTemplates: ResponseTemplateEntry[];
  slaTargets: SlaTargets;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const IssueTypeSchema = new Schema<IssueTypeEntry>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    defaultPriority: { type: String, required: true },
  },
  { _id: false }
);

const ResponseTemplateSchema = new Schema<ResponseTemplateEntry>(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    issueType: { type: String, required: true },
  },
  { _id: false }
);

const SlaTargetsSchema = new Schema<SlaTargets>(
  {
    firstResponseMinutes: { type: Number, required: true },
    resolutionMinutes: { type: Number, required: true },
  },
  { _id: false }
);

const IndustryPackSchema = new Schema<IndustryPackDoc>(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    issueTypes: { type: [IssueTypeSchema], default: [] },
    responseTemplates: { type: [ResponseTemplateSchema], default: [] },
    slaTargets: { type: SlaTargetsSchema, required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

IndustryPackSchema.index({ slug: 1 }, { unique: true });
IndustryPackSchema.index({ isActive: 1, sortOrder: 1 });

export const IndustryPack = mongoose.model<IndustryPackDoc>("IndustryPack", IndustryPackSchema);
