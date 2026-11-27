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

export type CauseListRangePreset =
  | "TODAY"
  | "TOMORROW"
  | "NEXT_7_DAYS"
  | "THIS_WEEK"
  | "CUSTOM";

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

/**
 * A defensive ceiling on how many hearings a single Cause List request
 * (JSON or export) may return.
 */
export const CAUSE_LIST_ROW_CAP = 5000;

/**
 * Get calendar date according to India Standard Time.
 */
function getIndiaDate(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/**
 * Add calendar days without depending on the server timezone.
 */
function addCalendarDays(
  date: {
    year: number;
    month: number;
    day: number;
  },
  days: number
) {
  const d = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  );

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Convert India midnight to UTC.
 * India Standard Time is UTC+05:30.
 */
function indiaStartOfDay(date: {
  year: number;
  month: number;
  day: number;
}): Date {
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day) -
      330 * 60 * 1000
  );
}

/**
 * End of a calendar day in India.
 */
function indiaEndOfDay(date: {
  year: number;
  month: number;
  day: number;
}): Date {
  const nextDay = addCalendarDays(date, 1);

  return new Date(
    indiaStartOfDay(nextDay).getTime() - 1
  );
}

/**
 * Parse YYYY-MM-DD as a calendar date.
 */
function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new BadRequestError(
      "Invalid date format. Use YYYY-MM-DD"
    );
  }

  return { year, month, day };
}

/**
 * Pure, unit-testable date-range resolution.
 * `now` is injectable so tests never depend on the wall clock.
 *
 * All date boundaries are calculated using Asia/Kolkata.
 */
export function resolveDateRange(
  filters: Pick<
    CauseListFilters,
    "rangePreset" | "startDate" | "endDate"
  >,
  now: Date = new Date()
): { start: Date; end: Date } {
  const today = getIndiaDate(now);

  switch (filters.rangePreset) {
    case "TODAY":
      return {
        start: indiaStartOfDay(today),
        end: indiaEndOfDay(today),
      };

    case "TOMORROW": {
      const tomorrow = addCalendarDays(today, 1);

      return {
        start: indiaStartOfDay(tomorrow),
        end: indiaEndOfDay(tomorrow),
      };
    }

    case "NEXT_7_DAYS": {
      // Tomorrow through the 7th calendar day from today.
      const tomorrow = addCalendarDays(today, 1);
      const daySeven = addCalendarDays(today, 7);

      return {
        start: indiaStartOfDay(tomorrow),
        end: indiaEndOfDay(daySeven),
      };
    }

    case "THIS_WEEK": {
      // Sunday-start week, based on India calendar date.
      const todayUtc = new Date(
        Date.UTC(today.year, today.month - 1, today.day)
      );

      const dayOfWeek = todayUtc.getUTCDay();

      const weekStart = addCalendarDays(today, -dayOfWeek);
      const weekEnd = addCalendarDays(weekStart, 6);

      return {
        start: indiaStartOfDay(weekStart),
        end: indiaEndOfDay(weekEnd),
      };
    }

    case "CUSTOM": {
      if (!filters.startDate || !filters.endDate) {
        throw new BadRequestError(
          "startDate and endDate are required when rangePreset is CUSTOM"
        );
      }

      const startDate = parseDateOnly(filters.startDate);
      const endDate = parseDateOnly(filters.endDate);

      return {
        start: indiaStartOfDay(startDate),
        end: indiaEndOfDay(endDate),
      };
    }
  }
}

/**
 * Groups an already-fetched row list for on-screen or exported rendering.
 * Court-wise groups by courtName.
 * Date-wise groups by the hearing's calendar date.
 */
export function groupRows(
  rows: CauseListRow[],
  groupBy: CauseListGroupBy
): CauseListGroup[] {
  if (groupBy === "NONE") {
    return [{ label: null, rows }];
  }

  const buckets = new Map<string, CauseListRow[]>();

  for (const row of rows) {
    const key =
      groupBy === "COURT"
        ? row.courtName ?? "Unspecified Court"
        : row.hearingDate.toISOString().slice(0, 10);

    const bucket = buckets.get(key) ?? [];

    bucket.push(row);

    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupRowsForLabel]) => ({
      label,
      rows: groupRowsForLabel,
    }));
}

/**
 * "Firm/My/Employee" is a filter on top of the actor's existing CASES
 * row-level scope.
 */
export async function listCauseList(
  actor: AccessTokenPayload,
  filters: CauseListFilters
) {
  const { start, end } = resolveDateRange(filters);

  const casesScope = resolveViewScope(
    actor as AuthorizedActor,
    "CASES"
  );

  const canViewFirmWide = casesScope === "ALL";

  const effectiveScope: CauseListScope = canViewFirmWide
    ? filters.scope
    : "MINE";

  if (
    effectiveScope === "EMPLOYEE" &&
    !filters.employeeId
  ) {
    throw new BadRequestError(
      "employeeId is required when scope is EMPLOYEE"
    );
  }

  /**
   * Associates receive case visibility for a hearing explicitly
   * assigned to them.
   */
  const caseConditions: Prisma.CaseWhereInput[] =
    actor.role === "ASSOCIATE"
      ? [{ deletedAt: null }]
      : [
          caseScopeWhere(actor as AuthorizedActor),
          { deletedAt: null },
        ];

  if (
    actor.role !== "ASSOCIATE" &&
    effectiveScope === "MINE"
  ) {
    caseConditions.push({
      OR: [
        { partnerId: actor.sub },
        {
          advocates: {
            some: {
              userId: actor.sub,
            },
          },
        },
      ],
    });
  } else if (
    actor.role !== "ASSOCIATE" &&
    effectiveScope === "EMPLOYEE" &&
    filters.employeeId
  ) {
    caseConditions.push({
      OR: [
        { partnerId: filters.employeeId },
        {
          advocates: {
            some: {
              userId: filters.employeeId,
            },
          },
        },
      ],
    });
  }

  // effectiveScope === "FIRM": no extra condition.

  // Advocate filter.
  if (filters.advocateId) {
    caseConditions.push({
      OR: [
        { partnerId: filters.advocateId },
        {
          advocates: {
            some: {
              userId: filters.advocateId,
            },
          },
        },
      ],
    });
  }

  if (filters.clientId) {
    caseConditions.push({
      clients: {
        some: {
          clientId: filters.clientId,
        },
      },
    });
  }

  if (filters.stage) {
    caseConditions.push({
      stage: filters.stage,
    });
  }

  if (filters.search) {
    const q = filters.search;

    caseConditions.push({
      OR: [
        {
          matterNumber: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          title: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          courtCaseNumber: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          clients: {
            some: {
              client: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          },
        },
      ],
    });
  }

  const hearingConditions: Prisma.HearingWhereInput[] = [
    {
      hearingDate: {
        gte: start,
        lte: end,
      },
    },
    {
      case: {
        AND: caseConditions,
      },
    },
  ];

  if (filters.courtName) {
    hearingConditions.push({
      courtName: filters.courtName,
    });
  }

  if (filters.courtHall) {
    hearingConditions.push({
      courtHall: filters.courtHall,
    });
  }

  if (filters.status) {
    hearingConditions.push({
      status: filters.status,
    });
  }

  const totalCount = await prisma.hearing.count({
    where: {
      AND: hearingConditions,
    },
  });

  if (totalCount > CAUSE_LIST_ROW_CAP) {
    throw new BadRequestError(
      `This range would return ${totalCount} hearings, which exceeds the ${CAUSE_LIST_ROW_CAP}-row export limit — narrow the date range or filters.`
    );
  }

  const hearings = await prisma.hearing.findMany({
    where: {
      AND: hearingConditions,
    },
    include: {
      case: {
        select: {
          id: true,
          matterNumber: true,
          title: true,
          stage: true,
          partner: {
            select: {
              id: true,
              name: true,
            },
          },
          advocates: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          clients: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [
      {
        hearingDate: "asc",
      },
    ],
  });

  /**
   * Batched follow-up for Next Hearing Date.
   */
  const caseIds = [
    ...new Set(hearings.map((h) => h.caseId)),
  ];

  const currentScheduled = await prisma.hearing.findMany({
    where: {
      caseId: {
        in: caseIds,
      },
      status: "SCHEDULED",
    },
    select: {
      caseId: true,
      hearingDate: true,
    },
  });

  const nextByCaseId = new Map(
    currentScheduled.map((h) => [
      h.caseId,
      h.hearingDate,
    ])
  );

  const rows: CauseListRow[] = hearings.map((h) => ({
    id: h.id,
    caseId: h.case.id,
    matterNumber: h.case.matterNumber,

    // Case title fallback to Matter Number.
    causeTitle:
      h.case.title ?? h.case.matterNumber,

    clientNames: h.case.clients.map(
      (c) => c.client.name
    ),

    courtName: h.courtName,
    courtHall: h.courtHall,
    hearingDate: h.hearingDate,
    hearingPurpose: h.purpose,
    caseStage: h.case.stage,

    advocates: [
      h.case.partner,
      ...h.case.advocates.map((a) => a.user),
    ],

    hearingStatus: h.status,

    nextHearingDate:
      h.status === "SCHEDULED"
        ? h.hearingDate
        : nextByCaseId.get(h.caseId) ?? null,
  }));

  return {
    rows,
    meta: {
      canViewFirmWide,
    },
  };
}