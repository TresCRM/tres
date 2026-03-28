import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { asObjectId } from "../utils/auth";
import { ActivityLog } from "../models/ActivityLog";
import { ErrorLog } from "../models/ErrorLog";
import { registry } from "../docs/swagger";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const logsRouter = Router();

const ListQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  route: z.string().optional(),
  method: z.enum(["GET","POST","PUT","PATCH","DELETE"]).optional(),
  status: z.coerce.number().optional(),
  code: z.string().optional(), // error code
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(), // _id cursor
});

logsRouter.get("/activity", requireAuth, requireRoles("OWNER","ADMIN"), async (req, res) => {
  const auth = (req as any).auth as { tid: string };
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (q.route) filter.route = q.route;
  if (q.method) filter.method = q.method;
  if (q.status) filter.status = q.status;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  const rows = await ActivityLog.find(filter).sort({ _id: -1 }).limit(q.limit).lean();
  const nextCursor = rows.length === q.limit ? String(rows[rows.length - 1]._id) : undefined;
  res.json({ data: rows, nextCursor });
});

logsRouter.get("/errors", requireAuth, requireRoles("OWNER","ADMIN"), async (req, res) => {
  const auth = (req as any).auth as { tid: string };
  const q = ListQuery.parse(req.query);
  const filter: any = { tenantId: asObjectId(auth.tid) };
  if (q.route) filter.route = q.route;
  if (q.method) filter.method = q.method;
  if (q.code) filter.code = q.code;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.cursor) filter._id = { $lt: asObjectId(q.cursor) };
  const rows = await ErrorLog.find(filter).sort({ _id: -1 }).limit(q.limit).lean();
  const nextCursor = rows.length === q.limit ? String(rows[rows.length - 1]._id) : undefined;
  res.json({ data: rows, nextCursor });
});

/* ---------- OpenAPI ---------- */
const ActivitySchema = z.object({
  _id: z.string(),
  tenantId: z.string().optional(),
  actorId: z.string().optional(),
  roles: z.array(z.string()),
  method: z.string(),
  route: z.string(),
  status: z.number(),
  durationMs: z.number(),
  requestId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  ip: z.string().optional(),
  ua: z.string().optional(),
  query: z.unknown().optional(),
  body: z.unknown().optional(),
  createdAt: z.string(),
});
const ErrorSchema = z.object({
  _id: z.string(),
  tenantId: z.string().optional(),
  actorId: z.string().optional(),
  roles: z.array(z.string()),
  requestId: z.string().optional(),
  route: z.string(),
  method: z.string(),
  http: z.number(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  createdAt: z.string()
});

registry.register("ActivityLog", ActivitySchema);
registry.register("ErrorLog", ErrorSchema);

for (const p of ["/api/v1/logs/activity","/api/v1/logs/errors"]) {
  registry.registerPath({
    tags: ["Activity (Logs)"],
    method: "get",
    path: p,
    request: { query: ListQuery },
    responses: {
      200: { description: "OK", content: { "application/json": {
        schema: z.object({ data: z.array(p.endsWith("errors") ? ErrorSchema : ActivitySchema), nextCursor: z.string().optional() })
      }}}
    }
  });
}
