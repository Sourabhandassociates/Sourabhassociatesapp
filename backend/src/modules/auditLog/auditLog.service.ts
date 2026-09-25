import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthorizedActor } from "../../utils/jwt";

/** Milestone 4 (Version 1.0 completion, SRD Section 24/29 — Audit Log Viewer). Reads
 * straight off the existing generic AuditLog (Section 29's standing convention — no
 * new schema, this is purely a query/UI surface over data every module has already
 * been writing since Phase 2). AUDIT_LOG.VIEW_ALL (Managing-Partner-only, seeded in
 * Step 3) sees every entry firm-wide; AUDIT_LOG.VIEW_OWN (Accounts Team, also seeded
 * in Step 3) is scoped to the actor's own actions only — both permission keys existed
 * before this milestone but had no screen reading them until now. */
export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  userId?: string;
  entityName?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLog(actor: AuthorizedActor, filters: AuditLogFilters) {
  const canViewAll = actor.effectivePermissions?.has("AUDIT_LOG.VIEW_ALL") ?? false;

  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (!canViewAll) conditions.push({ userId: actor.sub });
  if (filters.entityType) conditions.push({ entityType: filters.entityType });
  if (filters.action) conditions.push({ action: { contains: filters.action, mode: "insensitive" } });
  if (filters.userId) conditions.push({ userId: filters.userId });
  if (filters.entityName) conditions.push({ entityName: { contains: filters.entityName, mode: "insensitive" } });
  if (filters.startDate || filters.endDate) {
    conditions.push({
      createdAt: {
        gte: filters.startDate ? new Date(filters.startDate) : undefined,
        lte: filters.endDate ? new Date(filters.endDate) : undefined,
      },
    });
  }
  const where: Prisma.AuditLogWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  return { total, page: filters.page, pageSize: filters.pageSize, entries };
}
