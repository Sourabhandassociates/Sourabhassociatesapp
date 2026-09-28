import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import { importUpload } from "./importUpload";
import * as dataImportController from "./dataImport.controller";

/** Mounted at /api/data-import. Every route requires DATA_IMPORT.RUN (SRD Section 25 —
 * "Import restricted to Managing Partner and Office Staff"), including the template
 * download — no point exposing the exact bulk-create schema to a role that can't use it. */
export const dataImportRouter = Router();
dataImportRouter.use(requireAuth, requireStaff, attachEffectivePermissions, requirePermission("DATA_IMPORT.RUN"));

dataImportRouter.get("/:entityType/template", dataImportController.downloadTemplate);
dataImportRouter.post("/:entityType/preview", importUpload.single("file"), dataImportController.previewImport);
dataImportRouter.post("/:entityType/commit", dataImportController.commitImport);
