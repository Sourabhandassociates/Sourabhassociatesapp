import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as caseNotesController from "./caseNotes.controller";

/** Mounted at /api/cases/:caseId/notes */
export const caseNotesRouter = Router({ mergeParams: true });
caseNotesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
/** Case Section Access (2026-08-17) — CASE_NOTES.VIEW previously existed in the
 * catalogue but gated nothing at runtime; this is its first real enforcement. */
caseNotesRouter.get("/", requirePermission("CASE_NOTES.VIEW"), caseNotesController.listCaseNotes);
caseNotesRouter.post("/", requirePermission("CASE_NOTES.CREATE"), caseNotesController.addCaseNote);
