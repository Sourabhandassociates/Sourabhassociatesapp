import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as customFieldsController from "./customFields.controller";

/** Mounted at /api/custom-fields. Definition management (builder) is Managing-Partner-
 * only (CUSTOM_FIELDS.MANAGE); reading/writing a case's own values reuses CASES.EDIT/
 * case-access, matching how the values themselves are just another editable part of
 * the case, not a separately-permissioned resource. */
export const customFieldsRouter = Router();
customFieldsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
customFieldsRouter.get("/definitions", customFieldsController.listFieldDefinitions);
customFieldsRouter.post("/definitions", requirePermission("CUSTOM_FIELDS.MANAGE"), customFieldsController.createFieldDefinition);
customFieldsRouter.delete(
  "/definitions/:id",
  requirePermission("CUSTOM_FIELDS.MANAGE"),
  customFieldsController.deactivateFieldDefinition
);
customFieldsRouter.get("/cases/:caseId", customFieldsController.getFieldValuesForCase);
customFieldsRouter.put(
  "/cases/:caseId",
  requirePermission("CASES.EDIT"),
  customFieldsController.setFieldValuesForCase
);
