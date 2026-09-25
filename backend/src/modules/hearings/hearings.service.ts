import { prisma } from "../../config/prisma";
import { assertCaseAccess, assertHearingAccess, caseScopeWhere } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { notifyCaseTeam } from "../../utils/notify";
import { ConflictError } from "../../utils/errors";
import { AccessTokenPayload } from "../../utils/jwt";

export interface ScheduleHearingInput {
  hearingDate: string;
  courtName?: string;
  courtHall?: string;
  judgeName?: string;
  purpose?: string;
}

/**
 * Step 1 revision (Managing Partner review, item 6) — a case may have only ONE active
 * (SCHEDULED) hearing at a time. Scheduling a new one while an upcoming hearing already
 * exists is rejected in favor of rescheduling that existing hearing (`rescheduleHearing`
 * below) — that keeps "next hearing" unambiguous without ever creating a second
 * upcoming row for the same case.
 */
export async function scheduleHearing(actor: AccessTokenPayload, caseId: string, data: ScheduleHearingInput) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const existingScheduled = await prisma.hearing.findFirst({ where: { caseId, status: "SCHEDULED" } });
  if (existingScheduled) {
    throw new ConflictError(
      "This case already has an upcoming hearing — reschedule it instead of scheduling a new one."
    );
  }

  const hearing = await prisma.hearing.create({
    data: {
      caseId,
      hearingDate: new Date(data.hearingDate),
      courtName: data.courtName,
      courtHall: data.courtHall,
      judgeName: data.judgeName,
      purpose: data.purpose,
      createdById: actor.sub,
    },
  });

  await recordAuditLog(actor, "HEARING_SCHEDULED", "Hearing", hearing.id, { entityName: caseRecord.matterNumber });

  // Milestone 3 (SRD Section 17) — "upcoming hearing" trigger, fired at scheduling time
  // (an event-driven notification, not a scheduled reminder job — this app has no
  // cron/background-job infrastructure to add a true date-approaching digest).
  await notifyCaseTeam(
    caseId,
    "HEARING_SCHEDULED",
    `A hearing has been scheduled for ${new Date(hearing.hearingDate).toLocaleString()}`,
    actor.sub
  );

  return hearing;
}

export async function listHearingsForCase(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);

  return prisma.hearing.findMany({
    where: { caseId },
    orderBy: { hearingDate: "asc" },
  });
}

export interface RescheduleHearingInput {
  hearingDate: string;
  courtName?: string;
  courtHall?: string;
  judgeName?: string;
  purpose?: string;
}

/**
 * Step 1 revision (Managing Partner review, item 6) — edits the still-upcoming
 * hearing's date/details in place rather than completing it and creating a new row,
 * so "only one active Next Hearing per case" is trivially maintained (it's the same
 * row) and the old date never lingers on the calendar.
 */
export async function rescheduleHearing(actor: AccessTokenPayload, hearingId: string, data: RescheduleHearingInput) {
  const hearing = await assertHearingAccess(actor, hearingId);
  if (hearing.status !== "SCHEDULED") {
    throw new ConflictError("Only an upcoming (SCHEDULED) hearing can be rescheduled");
  }

  const updated = await prisma.hearing.update({
    where: { id: hearingId },
    data: {
      hearingDate: new Date(data.hearingDate),
      courtName: data.courtName,
      courtHall: data.courtHall,
      judgeName: data.judgeName,
      purpose: data.purpose,
    },
  });

  const changes = diffObjects(hearing, updated, ["hearingDate", "courtName", "courtHall", "judgeName", "purpose"]);
  await recordAuditLog(actor, "HEARING_RESCHEDULED", "Hearing", hearingId, changes ? { changes } : undefined);

  await notifyCaseTeam(
    hearing.caseId,
    "HEARING_RESCHEDULED",
    `A hearing has been rescheduled to ${new Date(updated.hearingDate).toLocaleString()}`,
    actor.sub
  );

  return updated;
}

export interface RecordOutcomeInput {
  outcomeNotes?: string;
  nextHearingDate?: string;
}

/**
 * SRD Section 15 — "outcome recording post-hearing auto-updates next hearing date."
 * Rather than a denormalized "next hearing date" field prone to drifting out of sync,
 * recording an outcome marks this row COMPLETED and, if a next date is supplied,
 * creates a new SCHEDULED row for it — that new row IS the updated next hearing.
 */
export async function recordHearingOutcome(actor: AccessTokenPayload, hearingId: string, data: RecordOutcomeInput) {
  const hearing = await assertHearingAccess(actor, hearingId);

  const [updated, nextHearing] = await prisma.$transaction(async (tx) => {
    const updatedHearing = await tx.hearing.update({
      where: { id: hearingId },
      data: { status: "COMPLETED", outcomeNotes: data.outcomeNotes },
    });

    const createdNextHearing = data.nextHearingDate
      ? await tx.hearing.create({
          data: {
            caseId: hearing.caseId,
            hearingDate: new Date(data.nextHearingDate),
            courtName: updatedHearing.courtName,
            courtHall: updatedHearing.courtHall,
            judgeName: updatedHearing.judgeName,
            createdById: actor.sub,
          },
        })
      : null;

    return [updatedHearing, createdNextHearing];
  });

  await recordAuditLog(actor, "HEARING_OUTCOME_RECORDED", "Hearing", hearingId, {
    details: nextHearing ? `Next hearing scheduled: ${nextHearing.id}` : undefined,
  });

  return { hearing: updated, nextHearing };
}

/**
 * SRD Section 15 — Hearing Calendar: all hearings across every case the actor can see,
 * in a date range, for the month/week/day calendar view and per-date click-to-view list.
 */
export async function listHearingsInRange(actor: AccessTokenPayload, startDate: string, endDate: string) {
  return prisma.hearing.findMany({
    where: {
      hearingDate: { gte: new Date(startDate), lte: new Date(endDate) },
      case: { ...caseScopeWhere(actor), deletedAt: null },
    },
    include: { case: { select: { id: true, matterNumber: true, title: true } } },
    orderBy: { hearingDate: "asc" },
  });
}

/**
 * Step 1 revision (Managing Partner review, items 5/6) — "Previous Hearing" is the
 * most recently COMPLETED hearing; "Next Hearing" is the single SCHEDULED one (the
 * scheduling/rescheduling rules above guarantee there's at most one). Used by the
 * Case Overview screen and, indirectly, the Hearing Calendar.
 */
export async function getCaseHearingSummary(caseId: string) {
  const [previousHearing, nextHearing] = await Promise.all([
    prisma.hearing.findFirst({ where: { caseId, status: "COMPLETED" }, orderBy: { hearingDate: "desc" } }),
    prisma.hearing.findFirst({ where: { caseId, status: "SCHEDULED" } }),
  ]);
  return { previousHearing, nextHearing };
}
