import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as picklistsController from "./picklists.controller";

/** Mounted at /api/picklists — SRD Step 1 revision item 8: admin-managed dropdown values.
 * Maps to the "Settings" module in STEP3_ROLE_PERMISSION_DESIGN.md Section 3.14. */
export const picklistsRouter = Router();
picklistsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

picklistsRouter.get("/:category", picklistsController.listValues);
picklistsRouter.post("/:category", requirePermission("SETTINGS.MANAGE"), picklistsController.addValue);
picklistsRouter.patch("/values/:id", requirePermission("SETTINGS.MANAGE"), picklistsController.updateValue);
