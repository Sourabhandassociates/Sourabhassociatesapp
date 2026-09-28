import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as tasksController from "./tasks.controller";

/** Mounted at /api/cases/:caseId/tasks */
export const caseTasksRouter = Router({ mergeParams: true });
caseTasksRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
/** Case Section Access (2026-08-17) — layered on top of, not a replacement for,
 * listTasksForCase's own assertCaseAccess check. Does not touch /tasks/:id or
 * /tasks/my — a task's own assignee must always be able to reach it regardless
 * of this Case-tab gate (assertTaskAccess's existing "always visible to its own
 * assignee" rule, untouched). */
caseTasksRouter.get("/", requirePermission("CASE_TASKS.VIEW"), tasksController.listTasksForCase);
caseTasksRouter.post("/", requirePermission("TASKS.CREATE"), tasksController.createTask);

/** Mounted at /api/tasks */
export const tasksRouter = Router();
tasksRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
tasksRouter.get("/my", tasksController.myTasks);
/** SRD Section 18.1 — Managing Partner Dashboard task breakdown, firm-wide (not row-scoped by design). */
tasksRouter.get("/all", requirePermission("TASKS.VIEW_ALL"), tasksController.listAllTasks);
/** Step 1 revision (Managing Partner review, item 3) — Employee Task Audit screen. */
tasksRouter.get("/audit/:userId", requirePermission("EMPLOYEE_AUDIT.VIEW"), tasksController.getEmployeeTaskAudit);
/** Step 1 second revision (item 1) — Task History for the Task Details screen. Registered
 * after the more specific GET routes above (/my, /all, /audit/:userId) so it doesn't
 * shadow them. */
tasksRouter.get("/:id", tasksController.getTaskDetail);
/**
 * Step 3 M2 completion — this route is not gated by a single route-level
 * requirePermission, because a PATCH body can touch fields, status, and assignee
 * together, needing up to three different permissions (TASKS.EDIT / .CHANGE_STATUS /
 * .ASSIGN) depending on what's actually in the request. That body-aware check lives
 * in `tasks.service.ts`'s `updateTask` (via `requiredTaskActions`/
 * `assertTaskActionsAllowed`), layered on top of `assertTaskAccess`'s row-level
 * check below it in the call chain — every request through this route is fully
 * permission-checked, just not by route middleware. See design doc §3.6.
 */
tasksRouter.patch("/:id", tasksController.updateTask);
/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): soft-deletes, never a real DELETE. */
tasksRouter.delete("/:id", requirePermission("TASKS.DELETE"), tasksController.deleteTask);
