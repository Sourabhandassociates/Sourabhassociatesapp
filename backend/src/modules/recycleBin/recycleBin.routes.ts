import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as recycleBinController from "./recycleBin.controller";

/**
 * Mounted at /api/recycle-bin — SRD Section 27. Managing-Partner-only in practice,
 * since every entry in the seeded catalogue (RECYCLE_BIN.VIEW and every entity's
 * RESTORE/PERMANENT_DELETE) defaults to Managing-Partner-only — but restore/
 * permanent-delete are gated by *that record's own entity-type permission*
 * (`recycleBin.service.ts`'s `assertEntityPermission`, design doc Section 3.12),
 * not a single blanket route-level role check, so the model already supports a
 * future Role Defaults change (e.g. an Associate who can restore Documents but
 * not Cases) without any further code change.
 */
export const recycleBinRouter = Router();
recycleBinRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

recycleBinRouter.get("/", requirePermission("RECYCLE_BIN.VIEW"), recycleBinController.listDeletedRecords);
recycleBinRouter.post("/:entityType/:id/restore", recycleBinController.restoreRecord);
recycleBinRouter.delete("/:entityType/:id", recycleBinController.permanentlyDeleteRecord);
