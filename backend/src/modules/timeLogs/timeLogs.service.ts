import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { assertCaseAccess } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";

/** SRD Section 16.1 — Time Tracking. Logged against a case, optionally a specific task. */
export interface CreateTimeLogInput {
  taskId?: string;
  date: string;
  hours: number;
  billable?: boolean;
  description?: string;
}

export async function createTimeLog(actor: AccessTokenPayload, caseId: string, input: CreateTimeLogInput) {
  const caseRecord = await assertCaseAccess(actor, caseId);
  if (input.hours <= 0) throw new BadRequestError("Hours must be greater than zero");

  if (input.taskId) {
    const task = await prisma.task.findFirst({ where: { id: input.taskId, caseId, deletedAt: null } });
    if (!task) throw new BadRequestError("taskId must belong to an existing task on this case");
  }

  const timeLog = await prisma.timeLog.create({
    data: {
      caseId,
      userId: actor.sub,
      taskId: input.taskId,
      date: new Date(input.date),
      hours: input.hours,
      billable: input.billable ?? true,
      description: input.description,
    },
  });
  await recordAuditLog(actor, "TIME_LOG_CREATED", "TimeLog", timeLog.id, {
    entityName: caseRecord.matterNumber,
    details: `${input.hours}h on ${input.date}`,
  });
  return timeLog;
}

export async function listTimeLogs(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);
  return prisma.timeLog.findMany({
    where: { caseId },
    include: { user: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
    orderBy: { date: "desc" },
  });
}

export interface UpdateTimeLogInput {
  date?: string;
  hours?: number;
  billable?: boolean;
  description?: string;
}

async function assertNotInvoiced(timeLogId: string) {
  const existing = await prisma.timeLog.findUnique({ where: { id: timeLogId } });
  if (!existing) throw new NotFoundError("Time log not found");
  if (existing.invoiced) throw new ForbiddenError("This time entry has already been invoiced and can no longer be changed");
  return existing;
}

export async function updateTimeLog(actor: AccessTokenPayload, id: string, input: UpdateTimeLogInput) {
  const existing = await assertNotInvoiced(id);
  const caseRecord = await assertCaseAccess(actor, existing.caseId);
  if (input.hours !== undefined && input.hours <= 0) throw new BadRequestError("Hours must be greater than zero");

  const updated = await prisma.timeLog.update({
    where: { id },
    data: { ...input, date: input.date ? new Date(input.date) : undefined },
  });

  const changes = diffObjects(existing, updated, ["date", "hours", "billable", "description"]);
  if (changes) {
    await recordAuditLog(actor, "TIME_LOG_UPDATED", "TimeLog", id, { entityName: caseRecord.matterNumber, changes });
  }
  return updated;
}

/** A genuine hard delete (unlike every other module's soft-delete) — this audit row
 * becomes the only surviving record this time entry ever existed, so it carries enough
 * (hours, date, case reference) to stand on its own rather than just an id. */
export async function deleteTimeLog(actor: AccessTokenPayload, id: string) {
  const existing = await assertNotInvoiced(id);
  const caseRecord = await assertCaseAccess(actor, existing.caseId);
  await prisma.timeLog.delete({ where: { id } });
  await recordAuditLog(actor, "TIME_LOG_DELETED", "TimeLog", id, {
    entityName: caseRecord.matterNumber,
    details: `${existing.hours}h on ${existing.date.toISOString().slice(0, 10)}`,
  });
}
