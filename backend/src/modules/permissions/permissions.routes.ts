import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as permissionsController from "./permissions.controller";

/**
 * Mounted at /api/permissions — SRD Section 8a, Step 3 M3. Every route here is
 * Managing-Partner-only, gated by both `USERS.MANAGE_PERMISSIONS` (the configurable
 * gate every other permission-checked route uses) and a hardcoded
 * `requireRole("MANAGING_PARTNER")` safety net that stays in place regardless of
 * what the configurable system says — this is the one screen that controls every
 * other permission, so its own access can't be made to depend entirely on the
 * system it configures (design doc Section 9.2).
 */
export const permissionsRouter = Router();
permissionsRouter.use(
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requireRole("MANAGING_PARTNER"),
  requirePermission("USERS.MANAGE_PERMISSIONS")
);

permissionsRouter.get("/catalogue", permissionsController.getCatalogue);
permissionsRouter.get("/role-defaults", permissionsController.getRoleDefaults);
permissionsRouter.patch("/role-defaults", permissionsController.updateRoleDefaults);
permissionsRouter.get("/employees/:userId", permissionsController.getEmployeePermissionSummary);
permissionsRouter.post("/employees/:userId/overrides", permissionsController.createOverride);
permissionsRouter.delete("/employees/:userId/overrides/:permissionKey", permissionsController.removeOverride);
permissionsRouter.post("/employees/:userId/reset", permissionsController.resetEmployeeToRoleDefaults);
