import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { caseScopeWhere } from "../../utils/authorization";
import { BadRequestError } from "../../utils/errors";
import { AccessTokenPayload, AuthorizedActor } from "../../utils/jwt";
import { resolveViewScope } from "../permissions/viewScope";

/**
 * SRD Section 15 — Cause List: a filterable, groupable view of the same Hearing
 * records the Calendar and Case Detail already read, not a separate data source.
 */

export type CauseListRangePreset = "TODAY" | "TOMORROW" | "NEXT_7_DAYS" | "THIS_WEEK" | "CUSTOM";
export type CauseListScope = "FIRM" | "MINE" | "EMPLOYEE";
export type CauseListGroupBy = "NONE" | "COURT" | "DATE";

export interface CauseListFilters {
  rangePreset: CauseListRangePreset;
  startDate?: string;
  endDate?: string;
  courtName?: string;
  courtHall?: string;
  advocateId?: string;
  clientId?: string;
  stage?: string;
  status?: "SCHEDULED" | "COMPLETED";
  search?: string;
  groupBy: CauseListGroupBy;
  scope: CauseListScope;
  employeeId?: string;
}

export interface CauseListRow {
  id: string;
  caseId: string;
  matterNumber: string;
  causeTitle: string;
  clientNames: string[];
  courtName: string | null;
  courtHall: string | null;
  hearingDate: Date;
  hearingPurpose: string | null;
  caseStage: string | null;
  advocates: { id: string; name: string }[];
  hearingStatus: "SCHEDULED" | "COMPLETED";
  nextHearingDate: Date | null;
}

export interface CauseListGroup {
  label: string | null;
  rows: CauseListRow[];
}

/** A defensive ceiling on how many hearings a single Cause List request (JSON or
 * export) may return — protects against an unbounded CUSTOM range on a large firm
 * producing a multi-minute PDF/Excel generation or an out-of-memory workbook. */
export const CAUSE_LIST_ROW_CAP = 5000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Pure, unit-testable date-range resolution — `now` is injectable so tests never
 * depend on the wall clock. THIS_WEEK is Sunday-start, matching HearingCalendar.tsx's
 * existing week-header convention.
 */
export function resolveDateRange(
  filters: Pick<CauseListFilters, "rangePreset" | "startDate" | "endDate">,
  now: Date = new Date()
): { start: Date; end: Date } {
  switch (filters.rangePreset) {
    case "TODAY":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "TOMORROW": {
      const tomorrow = addDays(now, 1);
      return { start: startOfDay(tomorrow), end: endOfDay(tomorrow) };
    }
    case "NEXT_7_DAYS": {
      // Cause List filter simplification (2026-08-11) — NEXT_7_DAYS is deliberately
      // exclusive of today (TODAY and TOMORROW are their own separate filters): the
      // window is the 7 calendar days starting tomorrow, i.e. tomorrow through day+7.
      const tomorrow = addDays(now, 1);
      return { start: startOfDay(tomorrow), end: endOfDay(addDays(now, 7)) };
    }
    case "THIS_WEEK": {
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const weekStart = addDays(now, -dayOfWeek);
      const weekEnd = addDays(weekStart, 6);
      return { start: startOfDay(weekStart), end: endOfDay(weekEnd) };
    }
    case "CUSTOM": {
      if (!filters.startDate || !filters.endDate) {
        throw new BadRequestError("startDate and endDate are required when rangePreset is CUSTOM");
      }
      return { start: startOfDay(new Date(filters.startDate)), end: endOfDay(new Date(filters.endDate)) };
    }
  }
}

/**
 * Groups an already-fetched row list for on-screen or exported rendering — pure,
 * no DB access. Court-wise groups by courtName (blank court last); Date-wise groups
 * by the hearing's calendar date. Deliberately reimplemented in the frontend (TypeScript,
 * same logic) rather than shared across the network boundary — this codebase already
 * buckets Hearing data client-side in HearingCalendar.tsx.
 */
export function groupRows(rows: CauseListRow[], groupBy: CauseListGroupBy): CauseListGroup[] {
  if (groupBy === "NONE") return [{ label: null, rows }];

  const buckets = new Map<string, CauseListRow[]>();
  for (const row of rows) {
    const key =
      groupBy === "COURT" ? (row.courtName ?? "Unspecified Court") : row.hearingDate.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupRowsForLabel]) => ({ label, rows: groupRowsForLabel }));
}

/**
 * "Firm/My/Employee" is a filter on top of the actor's existing CASES row-level
 * scope, not a new permission tier — FIRM/EMPLOYEE are only meaningful when the
 * actor's resolved CASES scope is already ALL (today: Managing Partner, Office
 * Staff). For anyone else, caseScopeWhere() below already hard-restricts the query
 * to their own assigned cases regardless of what scope they request; this downgrade
 * just keeps the *filter semantics* honest (no silent "you asked for Firm but got
 * Mine" surprise) rather than relying solely on that lower-level enforcement.
 */
export async function listCauseList(actor: AccessTokenPayload, filters: CauseListFilters) {
  const { start, end } = resolveDateRange(filters);
  const casesScope = resolveViewScope(actor as AuthorizedActor, "CASES");
  const canViewFirmWide = casesScope === "ALL";
  const effectiveScope: CauseListScope = canViewFirmWide ? filters.scope : "MINE";

  if (effectiveScope === "EMPLOYEE" && !filters.employeeId) {
    throw new BadRequestError("employeeId is required when scope is EMPLOYEE");
  }

  const caseConditions: Prisma.CaseWhereInput[] = [caseScopeWhere(actor as AuthorizedActor), { deletedAt: null }];

  if (effectiveScope === "MINE") {
    caseConditions.push({ OR: [{ partnerId: actor.sub }, { advocates: { some: { userId: actor.sub } } }] });
  } else if (effectiveScope === "EMPLOYEE" && filters.employeeId) {
    caseConditions.push({
      OR: [{ partnerId: filters.employeeId }, { advocates: { some: { userId: filters.employeeId } } }],
    });
  }
  // effectiveScope === "FIRM": no extra condition beyond caseScopeWhere (already {} for ALL scope).

  // The Advocate filter composes independently of the Firm/My/Employee toggle, so a
  // Managing Partner in Firm mode can further narrow to one advocate without switching modes.
  if (filters.advocateId) {
    caseConditions.push({
      OR: [{ partnerId: filters.advocateId }, { advocates: { some: { userId: filters.advocateId } } }],
    });
  }
  if (filters.clientId) caseConditions.push({ clients: { some: { clientId: filters.clientId } } });
  if (filters.stage) caseConditions.push({ stage: filters.stage });
  if (filters.search) {
    const q = filters.search;
    caseConditions.push({
      OR: [
        { matterNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { courtCaseNumber: { contains: q, mode: "insensitive" } },
        { clients: { some: { client: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }

  const hearingConditions: Prisma.HearingWhereInput[] = [
    { hearingDate: { gte: start, lte: end } },
    { case: { AND: caseConditions } },
  ];
  if (filters.courtName) hearingConditions.push({ courtName: filters.courtName });
  if (filters.courtHall) hearingConditions.push({ courtHall: filters.courtHall });
  if (filters.status) hearingConditions.push({ status: filters.status });

  const totalCount = await prisma.hearing.count({ where: { AND: hearingConditions } });
  if (totalCount > CAUSE_LIST_ROW_CAP) {
    throw new BadRequestError(
      `This range would return ${totalCount} hearings, which exceeds the ${CAUSE_LIST_ROW_CAP}-row export limit — narrow the date range or filters.`
    );
  }

  const hearings = await prisma.hearing.findMany({
    where: { AND: hearingConditions },
    include: {
      case: {
        select: {
          id: true,
          matterNumber: true,
          title: true,
          stage: true,
          partner: { select: { id: true, name: true } },
          advocates: { include: { user: { select: { id: true, name: true } } } },
          clients: { include: { client: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: [{ hearingDate: "asc" }],
  });

  // Batched follow-up for "Next Hearing Date" on rows whose own hearing isn't the
  // case's current SCHEDULED one (e.g. a COMPLETED row surfaced by a historical
  // custom-range query) — one query over the distinct caseIds already fetched,
  // never per-row, and no denormalization of Hearing data anywhere.
  const caseIds = [...new Set(hearings.map((h) => h.caseId))];
  const currentScheduled = await prisma.hearing.findMany({
    where: { caseId: { in: caseIds }, status: "SCHEDULED" },
    select: { caseId: true, hearingDate: true },
  });
  const nextByCaseId = new Map(currentScheduled.map((h) => [h.caseId, h.hearingDate]));

  const rows: CauseListRow[] = hearings.map((h) => ({
    id: h.id,
    caseId: h.case.id,
    matterNumber: h.case.matterNumber,
    // New Case form simplification (2026-08-11) — Case.title is now optional;
    // fall back to the always-present Matter Number, matching Global Search's
    // same fallback (search.service.ts).
    causeTitle: h.case.title ?? h.case.matterNumber,
    clientNames: h.case.clients.map((c) => c.client.name),
    courtName: h.courtName,
    courtHall: h.courtHall,
    hearingDate: h.hearingDate,
    hearingPurpose: h.purpose,
    caseStage: h.case.stage,
    advocates: [h.case.partner, ...h.case.advocates.map((a) => a.user)],
    hearingStatus: h.status,
    nextHearingDate: h.status === "SCHEDULED" ? h.hearingDate : (nextByCaseId.get(h.caseId) ?? null),
  }));

  return { rows, meta: { canViewFirmWide } };
}
