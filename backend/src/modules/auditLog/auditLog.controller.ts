import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { ForbiddenError } from "../../utils/errors";
import * as auditLogService from "./auditLog.service";

const querySchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  entityName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

/** Either AUDIT_LOG.VIEW_ALL (Managing Partner — firm-wide) or AUDIT_LOG.VIEW_OWN
 * (Accounts Team — own actions only) grants access; there's no single-key
 * `requirePermission` shape for "any of these," so the check lives here instead. */
export async function listAuditLog(req: Request, res: Response) {
  const perms = req.actor?.effectivePermissions;
  if (!perms?.has("AUDIT_LOG.VIEW_ALL") && !perms?.has("AUDIT_LOG.VIEW_OWN")) {
    throw new ForbiddenError("You do not have permission to view the audit log");
  }
  const query = parseBody(querySchema, req.query);
  const result = await auditLogService.listAuditLog(req.actor!, {
    ...query,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 50,
  });
  res.json(result);
}
