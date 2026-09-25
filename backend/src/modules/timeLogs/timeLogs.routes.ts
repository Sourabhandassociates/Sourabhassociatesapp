import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as timeLogsController from "./timeLogs.controller";

/** Mounted at /api/cases/:caseId/time-logs */
export const caseTimeLogsRouter = Router({ mergeParams: true });
caseTimeLogsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
/** Case Section Access (2026-08-17) — Time Logs live inside the Billing / Expenses
 * tab, so they're gated by CASE_BILLING_EXPENSES.VIEW/CREATE in addition to (never
 * instead of) the existing TIMELOGS.* permissions, which remain independently
 * authoritative for the time-log action itself. */
caseTimeLogsRouter.get(
  "/",
  requirePermission("CASE_BILLING_EXPENSES.VIEW"),
  requirePermission("TIMELOGS.VIEW"),
  timeLogsController.listTimeLogs
);
caseTimeLogsRouter.post(
  "/",
  requirePermission("CASE_BILLING_EXPENSES.VIEW"),
  requirePermission("TIMELOGS.CREATE"),
  timeLogsController.createTimeLog
);

/** Mounted at /api/time-logs */
export const timeLogsRouter = Router();
timeLogsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
timeLogsRouter.patch("/:id", requirePermission("TIMELOGS.EDIT"), timeLogsController.updateTimeLog);
timeLogsRouter.delete("/:id", requirePermission("TIMELOGS.DELETE"), timeLogsController.deleteTimeLog);
