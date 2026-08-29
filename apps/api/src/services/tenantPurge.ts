/**
 * @module services/tenantPurge
 * Hard-deletes a tenant and ALL records associated with it.
 *
 * WARNING: This is a destructive operation. Use only with SUPER_ADMIN + explicit confirmation.
 * The tenant itself is deleted last, after all dependent records are removed.
 *
 * Returns a breakdown of deleted counts per collection for audit logging.
 */
import { Types } from "mongoose";

// ─── Models with tenantId ─────────────────────────────

import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { Ticket } from "../models/Ticket";
import { Comment } from "../models/Comment";
import { Customer } from "../models/Customer";
import { Subscription } from "../models/Subscription";
import { Invoice } from "../models/Invoice";
import { Attachment } from "../models/Attachment";
import { Survey } from "../models/Survey";
import { SurveyInvite } from "../models/SurveyInvite";
import { SurveyResponse } from "../models/SurveyResponse";
import { EmailMessage } from "../models/EmailMessage";
import { EmailTemplate } from "../models/EmailTemplate";
import { ActivityLog } from "../models/ActivityLog";
import { ErrorLog } from "../models/ErrorLog";
import { ApiKey } from "../models/ApiKey";
import { Webhook } from "../models/Webhook";
import { WidgetToken } from "../models/WidgetToken";
import { TenantAddOn } from "../models/TenantAddOn";
import { DomainEvent } from "../models/DomainEvent";
import { RefreshToken } from "../models/RefreshToken";
import { TicketTemplate } from "../models/TicketTemplate";
import { TicketLink } from "../models/TicketLink";
import { SlaPolicy } from "../models/SlaPolicy";
import { Message } from "../models/Message";
import { ChatSession } from "../models/ChatSession";
import { Notification } from "../models/Notification";
import { ServiceStatus } from "../models/ServiceStatus";
import { IdempotencyResult } from "../models/IdempotencyResult";
import { AiUsage } from "../models/AiUsage";
import { KnowledgeArticle } from "../models/KnowledgeArticle";
import { VideoSession } from "../models/VideoSession";
import { CustomRole } from "../models/CustomRole";
import { CustomFieldDefinition } from "../models/CustomFieldDefinition";
import { Referral } from "../models/Referral";
import { WidgetImpression } from "../models/WidgetImpression";

export interface TenantPurgeResult {
  tenantId: string;
  tenantSlug: string;
  deletedCounts: Record<string, number>;
  totalDeleted: number;
  errors: string[];
}

/**
 * Hard-delete a tenant and every record tied to it.
 *
 * Strategy:
 *  1. Load the tenant (to capture slug for audit)
 *  2. Delete all child records (parallel for speed, but tenant deleted last)
 *  3. Delete the tenant document itself
 *
 * Errors in individual deletions are captured in `errors[]` but do NOT halt
 * the purge — we want to remove as much as possible even if one collection fails.
 */
export async function purgeTenant(tenantId: string): Promise<TenantPurgeResult> {
  const tid = new Types.ObjectId(tenantId);
  const tenant = await Tenant.findById(tid).lean();
  if (!tenant) {
    throw new Error("tenant_not_found");
  }

  const deletedCounts: Record<string, number> = {};
  const errors: string[] = [];

  // Each entry: [modelName, model reference]
  const collections: Array<[string, any]> = [
    ["User", User],
    ["Ticket", Ticket],
    ["Comment", Comment],
    ["Customer", Customer],
    ["Subscription", Subscription],
    ["Invoice", Invoice],
    ["Attachment", Attachment],
    ["Survey", Survey],
    ["SurveyInvite", SurveyInvite],
    ["SurveyResponse", SurveyResponse],
    ["EmailMessage", EmailMessage],
    ["EmailTemplate", EmailTemplate],
    ["ActivityLog", ActivityLog],
    ["ErrorLog", ErrorLog],
    ["ApiKey", ApiKey],
    ["Webhook", Webhook],
    ["WidgetToken", WidgetToken],
    ["TenantAddOn", TenantAddOn],
    ["DomainEvent", DomainEvent],
    ["RefreshToken", RefreshToken],
    ["TicketTemplate", TicketTemplate],
    ["TicketLink", TicketLink],
    ["SlaPolicy", SlaPolicy],
    ["Message", Message],
    ["ChatSession", ChatSession],
    ["Notification", Notification],
    ["ServiceStatus", ServiceStatus],
    ["IdempotencyResult", IdempotencyResult],
    ["AiUsage", AiUsage],
    ["KnowledgeArticle", KnowledgeArticle],
    ["VideoSession", VideoSession],
    ["CustomRole", CustomRole],
    ["CustomFieldDefinition", CustomFieldDefinition],
    ["Referral", Referral],
    ["WidgetImpression", WidgetImpression],
  ];

  // Delete all child records. We run sequentially for safety (not in a transaction
  // because MongoDB transactions require a replica set, and this is not always
  // available in all deployments).
  for (const [name, Model] of collections) {
    try {
      const result = await Model.deleteMany({ tenantId: tid });
      deletedCounts[name] = result.deletedCount || 0;
    } catch (e: any) {
      errors.push(`${name}: ${e.message || String(e)}`);
      deletedCounts[name] = 0;
    }
  }

  // Referrals can also reference tenant via referrerTenantId or referredTenantId
  try {
    const refResult = await Referral.deleteMany({
      $or: [{ referrerTenantId: tid }, { referredTenantId: tid }],
    });
    deletedCounts["Referral (reciprocal)"] = refResult.deletedCount || 0;
  } catch (e: any) {
    errors.push(`Referral (reciprocal): ${e.message || String(e)}`);
  }

  // Finally, delete the tenant itself
  try {
    await Tenant.deleteOne({ _id: tid });
    deletedCounts["Tenant"] = 1;
  } catch (e: any) {
    errors.push(`Tenant: ${e.message || String(e)}`);
    deletedCounts["Tenant"] = 0;
  }

  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

  return {
    tenantId: String(tenant._id),
    tenantSlug: tenant.slug,
    deletedCounts,
    totalDeleted,
    errors,
  };
}
