import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as reportsController from "./reports.controller";

/** Mounted at /api/reports. REPORTS.EXPORT gates PDF/Excel format specifically —
 * REPORTS.VIEW alone still gets the on-screen JSON table (SRD Section 19's two
 * separate actions, matching the same view/export-permission split already used
 * for Billing — STEP3_ROLE_PERMISSION_DESIGN.md's Section 3.16 seed). */
export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
reportsRouter.get("/types", requirePermission("REPORTS.VIEW"), reportsController.listReportTypes);
reportsRouter.get("/:type", requirePermission("REPORTS.VIEW"), reportsController.getReport);
