import { CaseStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { generateMatterNumber } from "../../utils/idGenerator";
import { BadRequestError } from "../../utils/errors";
import { assertCaseAccess, caseScopeWhere } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { notify, notifyCaseTeam } from "../../utils/notify";
import { AccessTokenPayload, AuthorizedActor } from "../../utils/jwt";
import { sanitizeRichText } from "../../utils/richText";

/** New Case form simplification (2026-08-11) — a blank/whitespace-only value is
 * normalized to NULL rather than stored as an empty string, matching the
 * Client-module optional-fields convention (clients.service.ts), so every
 * consumer only ever has to check for one falsy shape. */
function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Fields safe to expose about a User/Client nested inside a Case response — never passwordHash. */
const SAFE_USER_SELECT = { id: true, name: true, role: true } as const;
const SAFE_PARTNER_SELECT = { id: true, name: true } as const;
const SAFE_CLIENT_SELECT = {
  id: true,
  clientId: true,
  name: true,
  type: true,
  email: true,
  phone: true,
  status: true,
} as const;

const ADVOCATE_ROLES = ["ASSOCIATE", "JUNIOR_ASSOCIATE"];

/** Case Section Access (2026-08-17; extended 2026-08-18 with Facts/Arguments).
 * Mirrors accountsService.accountsPermissionFlags' exact shape/pattern —
 * GET /cases/section-permissions returns this so the frontend knows which of
 * the ten Case Detail tabs to render, without itself being the enforcement
 * (every backend route re-checks the real permission independently). */
export function caseSectionPermissionFlags(actor: AuthorizedActor) {
  const has = (key: string) => actor.effectivePermissions?.has(key) ?? false;
  return {
    overview: has("CASE_OVERVIEW.VIEW"),
    facts: has("CASE_FACTS.VIEW"),
    arguments: has("CASE_ARGUMENTS.VIEW"),
    documents: has("CASE_DOCUMENTS.VIEW"),
    tasks: has("CASE_TASKS.VIEW"),
    hearings: has("CASE_HEARINGS.VIEW"),
    timeline: has("CASE_TIMELINE.VIEW"),
    notes: has("CASE_NOTES.VIEW"),
    billingExpenses: has("CASE_BILLING_EXPENSES.VIEW"),
    accounts: has("CASE_ACCOUNTS.VIEW"),
  };
}

export interface CreateCaseInput {
  title?: string;
  practiceArea?: string;
  courtCaseNumber?: string;
  courtName?: string;
  courtNumber?: string;
  jurisdiction?: string;
  filingDate?: string;
  partnerId?: string;
  advocateIds: string[];
  clients: { clientId: string; partyRole: string }[];
  stage?: string;
  description?: string;
  caseType?: string;
  oppositeCounsel?: string;
  oppositeParty?: string;
  department?: string;
}

/**
 * SRD Section 10.1 — Matter Number is generated the moment the case is created,
 * independent of and never overwritten by the court case number.
 *
 * New Case form simplification (2026-08-11) — `partnerId` is still a required,
 * Managing-Partner-only FK at the authorization level (it drives case-level
 * access control, dashboards, and reports throughout the app), but the New Case
 * form no longer asks for it. When omitted: if the creator is a Managing
 * Partner, the case is auto-assigned to them; otherwise it's auto-assigned to
 * the firm's active Managing Partner (the earliest-registered one if there's
 * more than one — the Managing Partner Safety guarantee, Section 8a.4/9.3,
 * ensures at least one always exists, so this can never fail to resolve). The
 * Managing Partner can reassign the case afterward via the existing Case
 * Reassignment feature if the auto-pick is wrong.
 */
export async function createCase(actor: AccessTokenPayload, data: CreateCaseInput) {
  let partnerId = data.partnerId;
  if (!partnerId) {
    if (actor.role === "MANAGING_PARTNER") {
      partnerId = actor.sub;
    } else {
      const managingPartner = await prisma.user.findFirst({
        where: { role: "MANAGING_PARTNER", status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      if (!managingPartner) throw new BadRequestError("No active Managing Partner exists to own this case");
      partnerId = managingPartner.id;
    }
  }

  // Foreign keys are attacker/typo-controlled input — verify they resolve to the
  // right kind of record before touching the database, instead of letting a bad ID
  // surface as a raw Prisma constraint-violation error (ARCHITECTURE_REVIEW.md §5).
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner || partner.role !== "MANAGING_PARTNER") {
    throw new BadRequestError("partnerId must belong to an active Managing Partner");
  }

  if (data.advocateIds.length > 0) {
    const advocates = await prisma.user.findMany({ where: { id: { in: data.advocateIds } } });
    if (
      advocates.length !== data.advocateIds.length ||
      advocates.some((u) => !ADVOCATE_ROLES.includes(u.role))
    ) {
      throw new BadRequestError("advocateIds must all belong to existing Associate/Junior Associate users");
    }
  }

  const clientIds = data.clients.map((c) => c.clientId);
  const existingClients = await prisma.client.findMany({ where: { id: { in: clientIds } } });
  if (existingClients.length !== clientIds.length) {
    throw new BadRequestError("One or more client IDs do not correspond to an existing client");
  }

  const created = await prisma.case.create({
    data: {
      matterNumber: await generateMatterNumber(),
      title: normalizeOptional(data.title),
      practiceArea: normalizeOptional(data.practiceArea),
      courtCaseNumber: data.courtCaseNumber,
      courtName: data.courtName,
      courtNumber: normalizeOptional(data.courtNumber),
      jurisdiction: data.jurisdiction,
      filingDate: data.filingDate ? new Date(data.filingDate) : undefined,
      partnerId,
      stage: data.stage,
      description: data.description,
      caseType: data.caseType,
      oppositeCounsel: data.oppositeCounsel,
      oppositeParty: data.oppositeParty,
      department: data.department,
      advocates: { create: data.advocateIds.map((userId) => ({ userId })) },
      clients: { create: data.clients.map((c) => ({ clientId: c.clientId, partyRole: c.partyRole })) },
    },
    include: {
      clients: { include: { client: { select: SAFE_CLIENT_SELECT } } },
      advocates: { include: { user: { select: SAFE_USER_SELECT } } },
      partner: { select: SAFE_PARTNER_SELECT },
    },
  });
  await recordAuditLog(actor, "CASE_CREATED", "Case", created.id, { entityName: created.matterNumber });
  return created;
}

export interface ListCasesFilters {
  status?: string;
  practiceArea?: string;
  search?: string;
  /** Milestone 1 (Version 1.0 completion, SRD Section 10.1 — "Bulk filtering/search by
   * ... tag"). Tag values are curated via the TAG Picklist category (Section 10.3). */
  tag?: string;
  /** Milestone 4 (Version 1.0 completion) — IMPROVEMENTS.md #16 (pagination). */
  page?: number;
  pageSize?: number;
}

/** SRD Section 8's "View all cases — Office Staff ✅ (metadata only)" row: Office
 * Staff can see a case exists (parties, status, hearing schedule) but not its
 * free-text `description` field, which is where case strategy notes live — the
 * one Case field with no permission gate at all until this milestone. Applied at the
 * response layer (not the query) so the redaction can never be bypassed by a client
 * requesting different fields, and so every existing caller (listCases/getCase) gets
 * it automatically without duplicating the check. */
function redactForRole<T extends { description: string | null }>(actor: AccessTokenPayload, record: T): T {
  if (actor.role === "OFFICE_STAFF") {
    return { ...record, description: null };
  }
  return record;
}

export async function listCases(actor: AccessTokenPayload, filters: ListCasesFilters) {
  // Each condition is its own AND-ed member, deliberately, rather than merging into a
  // single object — caseScopeWhere() itself sets a top-level OR for scoped roles, and
  // the search condition below needs its own OR; merging both onto the same object
  // would have the search clause silently overwrite (bypass) the row-level scope.
  const conditions: Prisma.CaseWhereInput[] = [caseScopeWhere(actor), { deletedAt: null }];
  if (filters.status) conditions.push({ status: filters.status as CaseStatus });
  if (filters.practiceArea) conditions.push({ practiceArea: filters.practiceArea });
  if (filters.tag) conditions.push({ tags: { some: { tag: filters.tag } } });
  if (filters.search) {
    const search = filters.search;
    conditions.push({
      OR: [
        { matterNumber: { contains: search, mode: "insensitive" } },
        { courtCaseNumber: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.CaseWhereInput = conditions.length > 1 ? { AND: conditions } : conditions[0];

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const [total, cases] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.findMany({
      where,
      include: {
        partner: { select: SAFE_PARTNER_SELECT },
        advocates: { include: { user: { select: SAFE_USER_SELECT } } },
        clients: { include: { client: { select: SAFE_CLIENT_SELECT } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Response shape stays a plain array (no breaking change for existing callers —
  // frontend/CaseList.tsx, ContactDetail.tsx, Dashboard.tsx, and existing tests all
  // expect one); pagination metadata travels in response headers instead, the same
  // backward-compatible convention GitHub's REST API uses. See cases.controller.ts.
  const paginatedCases = cases.map((c) => redactForRole(actor, c));
  return Object.assign(paginatedCases, { total, page, pageSize });
}

/**
 * Case Section Access (2026-08-17) — this combined GET /cases/:id payload is the
 * frontend's ONLY source for documents/tasks/hearings/notes (CaseDetail.tsx never
 * calls the dedicated /cases/:caseId/documents etc. endpoints for its initial
 * render, only for mutations). Gating just those dedicated endpoints would leave
 * the underlying data fully present in this response regardless of the section
 * permission — exactly the "hiding tabs in the frontend is not sufficient"
 * anti-pattern the feature's spec §6 warns against. So this response-layer strip
 * (applied here, never at the query level, matching the existing redactForRole
 * precedent immediately above) is the actual enforcement for the read path;
 * the dedicated case-scoped routes are the enforcement for direct API access.
 * `hearings` needs BOTH CASE_HEARINGS.VIEW and CASE_TIMELINE.VIEW denied before
 * being stripped, since it feeds two independently-gated tabs (the Hearings table
 * and the read-only Timeline card) that happen to share one underlying array.
 */
function redactSectionsForActor<
  T extends { documents: unknown[]; tasks: unknown[]; notes: unknown[]; hearings: unknown[] }
>(actor: AuthorizedActor, record: T): T {
  const sections = caseSectionPermissionFlags(actor);
  return {
    ...record,
    documents: sections.documents ? record.documents : [],
    tasks: sections.tasks ? record.tasks : [],
    notes: sections.notes ? record.notes : [],
    hearings: sections.hearings || sections.timeline ? record.hearings : [],
  };
}

export async function getCase(actor: AuthorizedActor, caseId: string) {
  await assertCaseAccess(actor, caseId);

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      partner: { select: SAFE_PARTNER_SELECT },
      advocates: { include: { user: { select: SAFE_USER_SELECT } } },
      clients: { include: { client: { select: SAFE_CLIENT_SELECT } } },
      documents: { include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } },
      // Step 1 revision (item 9) — Smart Task Assignment needs to show who's already
      // working on this case, so tasks now come with their assignee's name attached.
      tasks: { include: { assignedTo: { select: SAFE_USER_SELECT } } },
      notes: { include: { author: { select: SAFE_USER_SELECT } }, orderBy: { createdAt: "asc" } },
      hearings: { orderBy: { hearingDate: "asc" } },
      tags: { orderBy: { tag: "asc" } },
    },
  });
  if (!caseRecord) return caseRecord;
  return redactSectionsForActor(actor, redactForRole(actor, caseRecord));
}

export interface UpdateCaseInput {
  title?: string;
  practiceArea?: string;
  courtCaseNumber?: string;
  courtName?: string;
  courtNumber?: string;
  jurisdiction?: string;
  filingDate?: string;
  stage?: string;
  description?: string;
  caseType?: string;
  oppositeCounsel?: string;
  oppositeParty?: string;
  department?: string;
}

const UPDATE_CASE_DIFF_FIELDS = [
  "title",
  "practiceArea",
  "courtCaseNumber",
  "courtName",
  "courtNumber",
  "jurisdiction",
  "filingDate",
  "stage",
  "description",
  "caseType",
  "oppositeCounsel",
  "oppositeParty",
  "department",
];

export async function updateCase(actor: AccessTokenPayload, caseId: string, data: UpdateCaseInput) {
  const before = await assertCaseAccess(actor, caseId);

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: { ...data, filingDate: data.filingDate ? new Date(data.filingDate) : undefined },
  });

  const changes = diffObjects(before, updated, UPDATE_CASE_DIFF_FIELDS);
  if (changes) {
    await recordAuditLog(actor, "CASE_UPDATED", "Case", caseId, { entityName: before.matterNumber, changes });
  }

  return updated;
}

export async function setCaseStatus(actor: AccessTokenPayload, caseId: string, status: CaseStatus) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const updated = await prisma.case.update({ where: { id: caseId }, data: { status } });

  await recordAuditLog(actor, "CASE_STATUS_CHANGED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    changes: { status: { old: caseRecord.status, new: updated.status } },
  });

  // Milestone 3 (SRD Section 17) — "case status change" trigger.
  await notifyCaseTeam(caseId, "CASE_STATUS_CHANGED", `${caseRecord.matterNumber} status changed to ${status}`, actor.sub);

  return { id: updated.id, status: updated.status };
}

export async function addAdvocate(actor: AccessTokenPayload, caseId: string, userId: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const advocate = await prisma.user.findUnique({ where: { id: userId } });
  if (!advocate || !ADVOCATE_ROLES.includes(advocate.role)) {
    throw new BadRequestError("userId must belong to an existing Associate/Junior Associate");
  }

  await prisma.caseAdvocate.create({ data: { caseId, userId } });
  await recordAuditLog(actor, "CASE_ADVOCATE_ADDED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    details: advocate.name,
  });
}

export async function removeAdvocate(actor: AccessTokenPayload, caseId: string, userId: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const advocate = await prisma.user.findUnique({ where: { id: userId } });
  await prisma.caseAdvocate.deleteMany({ where: { caseId, userId } });
  await recordAuditLog(actor, "CASE_ADVOCATE_REMOVED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    details: advocate?.name ?? userId,
  });
}

/** Milestone 1 (Version 1.0 completion, SRD Section 10.3 — Tagging System). Tag values
 * are curated via the TAG Picklist category; this just links a value to the case. */
export async function addTag(actor: AccessTokenPayload, caseId: string, tag: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);
  const trimmed = tag.trim();
  if (!trimmed) throw new BadRequestError("Tag cannot be empty");

  const link = await prisma.caseTag.upsert({
    where: { caseId_tag: { caseId, tag: trimmed } },
    create: { caseId, tag: trimmed },
    update: {},
  });
  await recordAuditLog(actor, "CASE_TAG_ADDED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    details: `+${trimmed}`,
  });
  return link;
}

export async function removeTag(actor: AccessTokenPayload, caseId: string, tag: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);
  await prisma.caseTag.deleteMany({ where: { caseId, tag } });
  await recordAuditLog(actor, "CASE_TAG_REMOVED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    details: `-${tag}`,
  });
}

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 10.1 — "Case reassignment workflow
 * (Partner-only) with audit trail"). Distinct from addAdvocate/removeAdvocate above,
 * which manage the Advocates on a case — this changes the single owning Partner
 * (`Case.partnerId`), route-gated to CASES.REASSIGN (Managing-Partner-only default).
 */
export async function reassignPartner(actor: AccessTokenPayload, caseId: string, newPartnerId: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const newPartner = await prisma.user.findUnique({ where: { id: newPartnerId } });
  if (!newPartner || newPartner.role !== "MANAGING_PARTNER" || newPartner.status !== "ACTIVE") {
    throw new BadRequestError("newPartnerId must belong to an active Managing Partner");
  }
  if (newPartnerId === caseRecord.partnerId) {
    throw new BadRequestError("Case is already assigned to this partner");
  }

  const oldPartner = await prisma.user.findUnique({ where: { id: caseRecord.partnerId } });
  const updated = await prisma.case.update({ where: { id: caseId }, data: { partnerId: newPartnerId } });

  await recordAuditLog(actor, "CASE_REASSIGNED", "Case", caseId, {
    entityName: caseRecord.matterNumber,
    details: `${oldPartner?.name ?? "Unknown"} -> ${newPartner.name}`,
    changes: { partner: { old: oldPartner?.name ?? "Unknown", new: newPartner.name } },
  });

  // Milestone 3 (SRD Section 17) — "case reassignment" trigger, direct to the new partner.
  if (newPartnerId !== actor.sub) {
    await notify(newPartnerId, "CASE_REASSIGNED", `${caseRecord.matterNumber} has been reassigned to you`, "Case", caseId);
  }

  return { id: updated.id, partnerId: updated.partnerId };
}

/**
 * Step 2 — Soft Delete & Recycle Bin (SRD Section 27). Never a real DELETE — sets
 * `deletedAt`/`deletedById` so the case disappears from every normal view (enforced by
 * `assertCaseAccess`/`listCases` requiring `deletedAt: null`) while the row and all its
 * relations stay intact for the Managing Partner to restore from the Recycle Bin.
 */
export async function deleteCase(actor: AccessTokenPayload, caseId: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  await prisma.case.update({
    where: { id: caseId },
    data: { deletedAt: new Date(), deletedById: actor.sub },
  });
  await recordAuditLog(actor, "CASE_DELETED", "Case", caseId, { entityName: caseRecord.matterNumber });
}

/**
 * Facts & Arguments case sections (2026-08-18) — §4/§5/§11. One current value
 * per Case (no versioning entity), stored directly on the Case row, matching
 * `description`'s existing precedent. The route-level `requirePermission
 * ("CASE_FACTS.VIEW"|"CASE_ARGUMENTS.VIEW")` gate is the section's ONLY
 * authorization layer beyond case-level access — per §11, this codebase's Case
 * Section Access architecture doesn't have a separate view/edit split for any
 * of its other sections either (Documents/Tasks/Hearings/etc. are all governed
 * by their own entity-level CRUD permissions instead — Facts/Arguments simply
 * have no entity-level CRUD permissions of their own to reuse, so the section
 * permission itself governs both, exactly as the spec asks for). `assertCaseAccess`
 * runs before the DB read/write in every one of these four functions — never
 * only at the route layer — so a caller can never reach another case's content
 * by supplying an out-of-scope caseId (§13).
 */
const FACTS_SELECT = {
  facts: true,
  factsUpdatedAt: true,
  factsUpdatedBy: { select: { id: true, name: true } },
} as const;

const ARGUMENTS_SELECT = {
  arguments: true,
  argumentsUpdatedAt: true,
  argumentsUpdatedBy: { select: { id: true, name: true } },
} as const;

export async function getFacts(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);
  return prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: FACTS_SELECT });
}

export async function updateFacts(actor: AccessTokenPayload, caseId: string, content: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);
  const sanitized = sanitizeRichText(content);
  const nextValue = sanitized || null;

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: { facts: nextValue, factsUpdatedAt: new Date(), factsUpdatedById: actor.sub },
    select: FACTS_SELECT,
  });
  // §12 — a short, fixed-size audit event, deliberately never the full rich-text
  // body (this audit system isn't designed for large repeated text payloads).
  if ((caseRecord.facts ?? null) !== nextValue) {
    await recordAuditLog(actor, "CASE_FACTS_UPDATED", "Case", caseId, {
      entityName: caseRecord.matterNumber,
      details: nextValue ? `Facts updated (${nextValue.length} characters)` : "Facts cleared",
    });
  }
  return updated;
}

export async function getArguments(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);
  return prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: ARGUMENTS_SELECT });
}

export async function updateArguments(actor: AccessTokenPayload, caseId: string, content: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);
  const sanitized = sanitizeRichText(content);
  const nextValue = sanitized || null;

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: { arguments: nextValue, argumentsUpdatedAt: new Date(), argumentsUpdatedById: actor.sub },
    select: ARGUMENTS_SELECT,
  });
  if ((caseRecord.arguments ?? null) !== nextValue) {
    await recordAuditLog(actor, "CASE_ARGUMENTS_UPDATED", "Case", caseId, {
      entityName: caseRecord.matterNumber,
      details: nextValue ? `Arguments updated (${nextValue.length} characters)` : "Arguments cleared",
    });
  }
  return updated;
}
