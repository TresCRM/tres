import { Types } from "mongoose";
import { ActivityLog } from "../models/ActivityLog";

export async function writeActivity(p: {
  tenantId?: string, 
  userId?: string,
  action: string, 
  resource?: string, 
  level?: "INFO"|"WARN"|"ERROR"|"AUDIT",
  ip?: string, 
  ua?: string, 
  route?: string,
  meta?: Record<string, any>
}) {
  return ActivityLog.create({
    tenantId: p.tenantId ? new Types.ObjectId(p.tenantId) : undefined,
    userId: p.userId ? new Types.ObjectId(p.userId) : undefined,
    action: p.action, resource: p.resource, level: p.level ?? "INFO",
    ip: p.ip, ua: p.ua, meta: p.meta,
    route: p.route
  });
}
