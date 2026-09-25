import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { assertCaseAccess, assertTaskAccess } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { notify } from "../../utils/notify";
import { AccessTokenPayload, AuthorizedActor } from "../../utils/jwt";

/**
 * SRD Section 18.1 — Managing Partner Dashboard: firm-wide task breakdown (pending,
 * overdue, completed), each with assignee and due date. "Overdue" is computed here
 * (dueDate passed and status isn't COMPLETED) rather than relying on the TaskStatus
 * enum's OVERDUE value being set manually, since nothing currently transitions a task
 * to OVERDUE on its own — that would require a scheduled job this phase doesn't add.
 */
export async function listAllTasks() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, case: { deletedAt: null } },
    include: {
      assignedTo: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
      case: { select: { id: true, matterNumber: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const now = new Date();
  return tasks.map((task) => ({
    ...task,
    isOverdue: task.status !== "COMPLETED" && !!task.dueDate && task.dueDate < now,
  }));
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate?: string;
  assignedToId: string;
}

export async function createTask(actor: AccessTokenPayload, caseId: string, data: CreateTaskInput) {
  await assertCaseAccess(actor, caseId);

  const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
  if (!assignee || assignee.status !== "ACTIVE") {
    throw new BadRequestError("assignedToId must belong to an existing, active staff member");
  }

  const task = await prisma.task.create({
    data: {
      caseId,
      title: data.title,
      description: data.description,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      assignedToId: data.assignedToId,
      assignedById: actor.sub,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  // Step 1 second revision (Managing Partner review, item 1) — Task History's first
  // entry: who created it and who it was initially assigned to.
  await recordAuditLog(actor, "TASK_CREATED", "Task", task.id, {
    entityName: task.title,
    details: `Assigned to ${assignee.name}`,
  });

  // Milestone 3 (SRD Section 17) — "new task assigned" trigger. No notification for a
  // self-assigned task (nothing to inform the actor of that they don't already know).
  if (assignee.id !== actor.sub) {
    await notify(assignee.id, "TASK_ASSIGNED", `You've been assigned a new task: ${task.title}`, "Task", task.id);
  }

  return task;
}

/** Milestone 4 (Version 1.0 completion) — IMPROVEMENTS.md #16 (pagination). Same
 * plain-array-plus-header-metadata pattern as cases.service.ts's listCases. */
export async function listTasksForCase(actor: AccessTokenPayload, caseId: string, page = 1, pageSize = 50) {
  await assertCaseAccess(actor, caseId);

  const where = { caseId, deletedAt: null };
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return Object.assign(tasks, { total, page, pageSize });
}

/** SRD Section 6.6 — "My Tasks" personal queue, across every case the user is assigned in. */
export async function myTasks(actor: AccessTokenPayload) {
  return prisma.task.findMany({
    where: { assignedToId: actor.sub, deletedAt: null, case: { deletedAt: null } },
    include: { case: { select: { id: true, matterNumber: true, title: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assignedToId?: string;
  status?: TaskStatus;
}

type TaskAction = "EDIT" | "CHANGE_STATUS" | "ASSIGN";

/**
 * A single PATCH can touch fields, status, and assignee together, so a single
 * route-level `requirePermission` gate can't express "TASKS.EDIT for field changes,
 * TASKS.CHANGE_STATUS for a status change, TASKS.ASSIGN for reassignment" — which
 * action(s) apply depends on which fields the request body actually contains.
 */
function requiredTaskActions(data: UpdateTaskInput): TaskAction[] {
  const actions: TaskAction[] = [];
  if (
    data.title !== undefined ||
    data.description !== undefined ||
    data.priority !== undefined ||
    data.dueDate !== undefined
  ) {
    actions.push("EDIT");
  }
  if (data.status !== undefined) actions.push("CHANGE_STATUS");
  if (data.assignedToId !== undefined) actions.push("ASSIGN");
  return actions;
}

/**
 * Step 3 M2 completion — permission-based authorization for PATCH /api/tasks/:id,
 * layered on top of `assertTaskAccess`'s existing row-level check (case-scope OR
 * assignee), never replacing it. Preserves the current assignee workflow exactly:
 * a task's own assignee may always act on it — tied to `TASKS.VIEW_OWN` (universally
 * granted today) rather than an unconditional code-level bypass, so it's a real,
 * revocable permission grant, not a hardcoded exception. A caller with case-scoped
 * (non-assignee) access still needs the specific `TASKS.<ACTION>` permission for
 * whatever the request body is actually trying to do.
 */
function assertTaskActionsAllowed(actor: AuthorizedActor, task: { assignedToId: string }, actions: TaskAction[]) {
  const granted = actor.effectivePermissions ?? new Set<string>();
  const isOwnTask = task.assignedToId === actor.sub;
  for (const action of actions) {
    const hasBroadPermission = granted.has(`TASKS.${action}`);
    const hasOwnTaskPermission = isOwnTask && granted.has("TASKS.VIEW_OWN");
    if (!hasBroadPermission && !hasOwnTaskPermission) {
      throw new ForbiddenError("You do not have permission to perform this action");
    }
  }
}

/**
 * Step 1 revision (Managing Partner review, item 1) — reassigning to a different
 * `assignedToId` is now audit-logged (who reassigned it, when, from whom to whom);
 * item 3 — `completedAt` is set/cleared alongside the `status` transition so the
 * Employee Task Audit's on-time stats have a real timestamp to work from.
 */
export async function updateTask(actor: AuthorizedActor, taskId: string, data: UpdateTaskInput) {
  const current = await assertTaskAccess(actor, taskId);
  assertTaskActionsAllowed(actor, current, requiredTaskActions(data));

  let newAssignee: { id: string; name: string } | null = null;
  if (data.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
    if (!assignee || assignee.status !== "ACTIVE") {
      throw new BadRequestError("assignedToId must belong to an existing, active staff member");
    }
    newAssignee = assignee;
  }

  const isReassignment = !!data.assignedToId && data.assignedToId !== current.assignedToId;
  const completedAt =
    data.status === undefined
      ? undefined
      : data.status === "COMPLETED"
        ? new Date()
        : data.status !== current.status
          ? null
          : undefined;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined, completedAt },
  });

  if (isReassignment) {
    const previousAssignee = await prisma.user.findUnique({ where: { id: current.assignedToId } });
    const oldAssigneeName = previousAssignee?.name ?? current.assignedToId;
    const newAssigneeName = newAssignee?.name ?? data.assignedToId;
    await recordAuditLog(actor, "TASK_REASSIGNED", "Task", taskId, {
      entityName: current.title,
      details: `${oldAssigneeName} -> ${newAssigneeName}`,
      changes: { assignedTo: { old: oldAssigneeName, new: newAssigneeName } },
    });
    if (newAssignee && newAssignee.id !== actor.sub) {
      await notify(newAssignee.id, "TASK_ASSIGNED", `You've been assigned a task: ${updated.title}`, "Task", taskId);
    }
  }

  // Step 1 second revision (item 1) — every status transition is its own Task History
  // entry, distinct from reassignment, so "completed by," "reopened," and the full
  // Pending -> In Progress -> Completed (-> reopened) chain are all reconstructable.
  if (data.status !== undefined && data.status !== current.status) {
    const label = current.status === "COMPLETED" ? "reopened" : undefined;
    await recordAuditLog(actor, "TASK_STATUS_CHANGED", "Task", taskId, {
      entityName: current.title,
      details: label,
      changes: { status: { old: current.status, new: data.status } },
    });
  }

  // Firm-wide audit trail expansion (2026-08-13) — plain field edits (title/description/
  // priority/dueDate) get their own entry, deliberately excluding assignedToId/status
  // since those are already covered by the two branches above (no double-logging).
  const fieldChanges = diffObjects(current, updated, ["title", "description", "priority", "dueDate"]);
  if (fieldChanges) {
    await recordAuditLog(actor, "TASK_UPDATED", "Task", taskId, { entityName: current.title, changes: fieldChanges });
  }

  return updated;
}

/**
 * Step 1 second revision (Managing Partner review, item 1) — Task History: the full
 * chronological trail (created, initial assignee, every reassignment, every status
 * change/completion/reopen) for the Task Details screen. Reads straight off the
 * generic Audit Log rather than a task-specific history table, consistent with
 * AuditLog's design (utils/auditLog.ts) as the one place any module logs "what
 * happened, by whom, when" without needing its own schema.
 */
export async function getTaskDetail(actor: AccessTokenPayload, taskId: string) {
  await assertTaskAccess(actor, taskId);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
      case: { select: { id: true, matterNumber: true, title: true } },
    },
  });
  if (!task) throw new NotFoundError("Task not found");

  const auditEntries = await prisma.auditLog.findMany({
    where: { entityType: "Task", entityId: taskId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return { task, history: auditEntries };
}

/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27). Soft-delete only — the task row
 * (and its Task History) stays intact for the Managing Partner to restore from the
 * Recycle Bin. */
export async function deleteTask(actor: AccessTokenPayload, taskId: string) {
  const task = await assertTaskAccess(actor, taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date(), deletedById: actor.sub },
  });
  await recordAuditLog(actor, "TASK_DELETED", "Task", taskId, { entityName: task.title });
}

export interface EmployeeTaskAuditFilters {
  startDate?: string;
  endDate?: string;
  search?: string;
}

/**
 * Step 1 second revision (Managing Partner review, item 4) — Employee Workload: every
 * case the employee is currently on (as owning Partner or assigned Advocate), excluding
 * Closed/Archived ones since those no longer represent live workload. `totalActiveCases`
 * counts only the ACTIVE-status subset (matching the Dashboard's own "Active Cases"
 * definition); `currentCases` is the fuller list (including Intake/On-Hold) so the
 * Managing Partner sees the whole current caseload, not just the narrowest slice.
 */
async function getEmployeeCurrentCases(userId: string) {
  const cases = await prisma.case.findMany({
    where: {
      OR: [{ partnerId: userId }, { advocates: { some: { userId } } }],
      status: { notIn: ["CLOSED", "ARCHIVED"] },
      deletedAt: null,
    },
    select: { id: true, matterNumber: true, title: true, status: true },
    orderBy: { matterNumber: "asc" },
  });
  return { totalActiveCases: cases.filter((c) => c.status === "ACTIVE").length, currentCases: cases };
}

/**
 * Step 1 revision (Managing Partner review, item 3) — Employee Task Audit: everything
 * a given employee is/was assigned, with date-range filtering on due date, a text
 * search across task title and matter, and productivity stats (completion rate, on-time
 * rate) computed from `completedAt` vs `dueDate`. Managing-Partner-only, enforced at
 * the route level (this function itself is unrestricted, like `listAllTasks`).
 */
export async function getEmployeeTaskAudit(userId: string, filters: EmployeeTaskAuditFilters) {
  const conditions: Prisma.TaskWhereInput[] = [
    { assignedToId: userId, deletedAt: null, case: { deletedAt: null } },
  ];
  if (filters.startDate) conditions.push({ dueDate: { gte: new Date(filters.startDate) } });
  if (filters.endDate) conditions.push({ dueDate: { lte: new Date(filters.endDate) } });
  if (filters.search) {
    const search = filters.search;
    conditions.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { case: { matterNumber: { contains: search, mode: "insensitive" } } },
        { case: { title: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.TaskWhereInput = conditions.length > 1 ? { AND: conditions } : conditions[0];

  const tasks = await prisma.task.findMany({
    where,
    include: { case: { select: { id: true, matterNumber: true, title: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const now = new Date();
  const withOverdue = tasks.map((task) => ({
    ...task,
    isOverdue: task.status !== "COMPLETED" && !!task.dueDate && task.dueDate < now,
  }));

  const total = withOverdue.length;
  const completed = withOverdue.filter((t) => t.status === "COMPLETED").length;
  const pending = withOverdue.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const overdue = withOverdue.filter((t) => t.isOverdue).length;
  const onTimeCompleted = withOverdue.filter(
    (t) => t.status === "COMPLETED" && t.completedAt && t.dueDate && t.completedAt <= t.dueDate
  ).length;

  const { totalActiveCases, currentCases } = await getEmployeeCurrentCases(userId);

  return {
    tasks: withOverdue,
    stats: {
      total,
      completed,
      pending,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      onTimeRate: completed > 0 ? Math.round((onTimeCompleted / completed) * 100) : 0,
      totalActiveCases,
    },
    currentCases,
  };
}
