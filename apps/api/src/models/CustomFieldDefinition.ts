import mongoose, { Schema, Types } from "mongoose";

export const ENTITY_TYPES = ["TICKET", "CUSTOMER"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const FIELD_TYPES = [
  "TEXT", "NUMBER", "DATE", "DROPDOWN", "MULTI_SELECT", "CHECKBOX", "URL", "EMAIL",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface CustomFieldDefinitionDoc {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  entityType: EntityType;
  issueType?: string;
  name: string; // machine-readable
  label: string; // human-readable
  type: FieldType;
  options?: string[]; // for DROPDOWN, MULTI_SELECT
  isRequired: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  defaultValue?: any;
  placeholder?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldDefinitionSchema = new Schema<CustomFieldDefinitionDoc>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  entityType: { type: String, enum: ENTITY_TYPES, required: true },
  issueType: String,
  name: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: FIELD_TYPES, required: true },
  options: [String],
  isRequired: { type: Boolean, default: false },
  isSearchable: { type: Boolean, default: false },
  isFilterable: { type: Boolean, default: false },
  defaultValue: Schema.Types.Mixed,
  placeholder: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

CustomFieldDefinitionSchema.index({ tenantId: 1, entityType: 1, isActive: 1, sortOrder: 1 });
CustomFieldDefinitionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const CustomFieldDefinition = mongoose.model<CustomFieldDefinitionDoc>(
  "CustomFieldDefinition",
  CustomFieldDefinitionSchema,
);
