import fs from "fs/promises";
import path from "path";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { recordAuditLog } from "../../utils/auditLog";
import { AuthorizedActor } from "../../utils/jwt";

/**
 * SRD Section 27 — Recycle Bin & Soft-Delete Policy, Managing-Partner-only (enforced at
 * the route level, same as every other MP-only screen — this module has no row-level
 * scoping of its own since the Managing Partner is unrestricted by definition).
 *
 * Generic across the entities that support soft delete today (Case, Client, Document,
 * Task, and — Milestone 1, Version 1.0 completion — Contact) via a small per-entity
 * `switch`, rather than one fully-polymorphic function — Prisma's per-model typed
 * delegates make true type-safe genericity awkward without `any`. Adding a further
 * soft-deletable entity means: add its `deletedAt`/`deletedById` columns
 * (schema.prisma), add one `case` block to each of the three functions below following
 * the exact shape already there, and add its type to `RECYCLABLE_ENTITY_TYPES` — Contact
 * below is the reference example of exactly that extension, predicted by this same
 * comment when it was written for Step 2.
 */
export type RecyclableEntityType = "Case" | "Client" | "Document" | "Task" | "Contact" | "Expense";
const RECYCLABLE_ENTITY_TYPES: RecyclableEntityType[] = [
  "Case",
  "Client",
  "Document",
  "Task",
  "Contact",
  "Expense",
];

function assertValidEntityType(entityType: string): asserts entityType is RecyclableEntityType {
  if (!RECYCLABLE_ENTITY_TYPES.includes(entityType as RecyclableEntityType)) {
    throw new BadRequestError(`Unknown recyclable entity type: ${entityType}`);
  }
}

/**
 * Step 3 M2 — restoring/permanently-deleting a specific record is gated by *that
 * entity's own* module permission (CASES.RESTORE, DOCUMENTS.PERMANENT_DELETE, etc.
 * — STEP3_ROLE_PERMISSION_DESIGN.md Section 3.12), not a single blanket Recycle Bin
 * permission — mirroring the switch-based-per-entity shape the rest of this module
 * already uses. Every entity's RESTORE/PERMANENT_DELETE default is Managing-Partner-
 * only (design doc Section 3.4/3.5/3.6/3.9), matching today's router-level MP-only
 * gate exactly, so this is a like-for-like swap, not a behavior change.
 */
function assertEntityPermission(actor: AuthorizedActor, entityType: RecyclableEntityType, action: "RESTORE" | "PERMANENT_DELETE") {
  const key = `${entityType.toUpperCase()}S.${action}`;
  if (!actor.effectivePermissions?.has(key)) {
    throw new ForbiddenError("You do not have permission to perform this action");
  }
}

export interface RecycleBinEntry {
  entityType: RecyclableEntityType;
  id: string;
  label: string;
  deletedAt: Date;
  deletedBy: { id: string; name: string } | null;
}

/** Requirement #3/#6 — everything currently in the bin, across all entity types, most
 * recently deleted first. */
export async function listDeletedRecords(): Promise<RecycleBinEntry[]> {
  const [cases, clients, documents, tasks, contacts, expenses] = await Promise.all([
    prisma.case.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        matterNumber: true,
        title: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.client.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        clientId: true,
        name: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.document.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
        case: { select: { matterNumber: true } },
      },
    }),
    prisma.task.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
        case: { select: { matterNumber: true } },
      },
    }),
    prisma.contact.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.expense.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        category: true,
        amount: true,
        deletedAt: true,
        deletedBy: { select: { id: true, name: true } },
        case: { select: { matterNumber: true } },
      },
    }),
  ]);

  const entries: RecycleBinEntry[] = [
    // New Case form simplification (2026-08-11) — Case.title is now optional;
    // omit the dash entirely rather than leaking a literal "— null"/"— " suffix.
    ...cases.map((c) => ({
      entityType: "Case" as const,
      id: c.id,
      label: c.title ? `${c.matterNumber} — ${c.title}` : c.matterNumber,
      deletedAt: c.deletedAt!,
      deletedBy: c.deletedBy,
    })),
    ...clients.map((c) => ({
      entityType: "Client" as const,
      id: c.id,
      label: `${c.clientId} — ${c.name}`,
      deletedAt: c.deletedAt!,
      deletedBy: c.deletedBy,
    })),
    // ACCOUNTS module (2026-08-14) — a document can now be client-level (no case at
    // all), so `d.case` may be null.
    ...documents.map((d) => ({
      entityType: "Document" as const,
      id: d.id,
      label: d.case ? `${d.title} (${d.case.matterNumber})` : d.title,
      deletedAt: d.deletedAt!,
      deletedBy: d.deletedBy,
    })),
    ...tasks.map((t) => ({
      entityType: "Task" as const,
      id: t.id,
      label: `${t.title} (${t.case.matterNumber})`,
      deletedAt: t.deletedAt!,
      deletedBy: t.deletedBy,
    })),
    ...contacts.map((c) => ({
      entityType: "Contact" as const,
      id: c.id,
      label: c.name,
      deletedAt: c.deletedAt!,
      deletedBy: c.deletedBy,
    })),
    // ACCOUNTS Overview/Expenses completion pass (2026-08-15) — an expense can now be
    // General/Firm (no case) or Client-level (no case), so `e.case` may be null.
    ...expenses.map((e) => ({
      entityType: "Expense" as const,
      id: e.id,
      label: e.case ? `${e.category} — ${e.amount} (${e.case.matterNumber})` : `${e.category} — ${e.amount}`,
      deletedAt: e.deletedAt!,
      deletedBy: e.deletedBy,
    })),
  ];

  return entries.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

/** Requirement #7 — restore brings back the complete record with all relationships
 * intact, which is trivially true here: soft delete never removed any row or
 * relation, it only set `deletedAt`/`deletedById`, so restoring is just clearing them. */
export async function restoreRecord(actor: AuthorizedActor, entityType: string, id: string) {
  assertValidEntityType(entityType);
  assertEntityPermission(actor, entityType, "RESTORE");
  const restoreData = { deletedAt: null, deletedById: null };
  let label = id;

  switch (entityType) {
    case "Case": {
      const existing = await prisma.case.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted case not found");
      await prisma.case.update({ where: { id }, data: restoreData });
      label = existing.matterNumber;
      break;
    }
    case "Client": {
      const existing = await prisma.client.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted client not found");
      await prisma.client.update({ where: { id }, data: restoreData });
      label = existing.clientId;
      break;
    }
    case "Document": {
      const existing = await prisma.document.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted document not found");
      await prisma.document.update({ where: { id }, data: restoreData });
      label = existing.title;
      break;
    }
    case "Task": {
      const existing = await prisma.task.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted task not found");
      await prisma.task.update({ where: { id }, data: restoreData });
      label = existing.title;
      break;
    }
    case "Contact": {
      const existing = await prisma.contact.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted contact not found");
      await prisma.contact.update({ where: { id }, data: restoreData });
      label = existing.name;
      break;
    }
    case "Expense": {
      const existing = await prisma.expense.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted expense not found");
      await prisma.expense.update({ where: { id }, data: restoreData });
      label = `${existing.category} — ${existing.amount}`;
      break;
    }
  }

  await recordAuditLog(actor, `${entityType.toUpperCase()}_RESTORED`, entityType, id, { entityName: label });
}

/**
 * Requirement #2/#4 — the only path in the entire application that performs a real,
 * irreversible delete, and only on a record already sitting in the Recycle Bin (never
 * a live one) — so even the Managing Partner can't skip the soft-delete step. Cascades
 * to child rows via the schema's `onDelete: Cascade` relations (backend/prisma/schema.prisma),
 * not application-level cleanup code.
 */
export async function permanentlyDeleteRecord(actor: AuthorizedActor, entityType: string, id: string) {
  assertValidEntityType(entityType);
  assertEntityPermission(actor, entityType, "PERMANENT_DELETE");
  let label = id;

  switch (entityType) {
    case "Case": {
      const existing = await prisma.case.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted case not found");
      label = existing.matterNumber;
      await prisma.case.delete({ where: { id } });
      break;
    }
    case "Client": {
      const existing = await prisma.client.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted client not found");
      label = existing.clientId;
      await prisma.client.delete({ where: { id } });
      break;
    }
    case "Document": {
      const existing = await prisma.document.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { versions: { select: { storagePath: true } } },
      });
      if (!existing) throw new NotFoundError("Deleted document not found");
      label = existing.title;
      await prisma.document.delete({ where: { id } }); // cascades to DocumentVersion rows
      // Best-effort disk cleanup — a failure here (file already gone, permissions,
      // etc.) must not roll back or fail the DB deletion that already succeeded.
      await Promise.all(
        existing.versions.map(async (v) => {
          try {
            await fs.unlink(path.join(path.resolve(env.uploadDir), v.storagePath));
          } catch {
            // Already missing or inaccessible — nothing more to do.
          }
        })
      );
      break;
    }
    case "Task": {
      const existing = await prisma.task.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted task not found");
      label = existing.title;
      await prisma.task.delete({ where: { id } });
      break;
    }
    case "Contact": {
      const existing = await prisma.contact.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted contact not found");
      label = existing.name;
      await prisma.contact.delete({ where: { id } }); // cascades to ContactMatter rows
      break;
    }
    case "Expense": {
      const existing = await prisma.expense.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!existing) throw new NotFoundError("Deleted expense not found");
      label = `${existing.category} — ${existing.amount}`;
      await prisma.expense.delete({ where: { id } });
      break;
    }
  }

  await recordAuditLog(actor, `${entityType.toUpperCase()}_PERMANENTLY_DELETED`, entityType, id, { entityName: label });
}
