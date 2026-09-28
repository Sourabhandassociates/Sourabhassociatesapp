import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as hearingsController from "./hearings.controller";
import * as causeListController from "./causeList.controller";

/** Mounted at /api/cases/:caseId/hearings */
export const caseHearingsRouter = Router({ mergeParams: true });
caseHearingsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
/** Case Section Access (2026-08-17) — covers the Hearings tab (the full
 * schedule/outcome table). The Timeline tab reuses this same underlying hearings
 * data read-only from the combined GET /cases/:id payload (cases.service.ts's
 * getCase), gated there by CASE_TIMELINE.VIEW independently — the two tabs are
 * separately permission-gated even though they're both hearing data. */
caseHearingsRouter.get("/", requirePermission("CASE_HEARINGS.VIEW"), hearingsController.listHearingsForCase);
caseHearingsRouter.post("/", requirePermission("HEARINGS.CREATE"), hearingsController.scheduleHearing);

/** Mounted at /api/hearings */
export const hearingsRouter = Router();
hearingsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
hearingsRouter.get("/", hearingsController.listHearingsInRange);
/** Step 4 — Cause List: same access surface as the range endpoint above (case-scope
 * only, no new permission gate), just richer filtering/grouping/export. */
hearingsRouter.get("/cause-list", causeListController.listCauseList);
hearingsRouter.get("/cause-list/export/pdf", causeListController.exportCauseListPdf);
hearingsRouter.get("/cause-list/export/excel", causeListController.exportCauseListExcel);
hearingsRouter.patch("/:id/outcome", requirePermission("HEARINGS.EDIT"), hearingsController.recordHearingOutcome);
/** Step 1 revision (Managing Partner review, item 6) — reschedule the still-upcoming hearing in place. */
hearingsRouter.patch("/:id", requirePermission("HEARINGS.EDIT"), hearingsController.rescheduleHearing);
