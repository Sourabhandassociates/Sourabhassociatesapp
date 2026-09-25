import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import { upload } from "./storage";
import * as documentsController from "./documents.controller";

/** Mounted at /api/cases/:caseId/documents — mergeParams so :caseId is visible here. */
export const caseDocumentsRouter = Router({ mergeParams: true });
caseDocumentsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
/** Case Section Access (2026-08-17) — an additional gate layered on top of the
 * existing `assertCaseAccess` row-level check inside listDocumentsForCase, not a
 * replacement for it (a user must satisfy both). */
caseDocumentsRouter.get("/", requirePermission("CASE_DOCUMENTS.VIEW"), documentsController.listDocumentsForCase);
/** DOCUMENTS.UPLOAD defaults to granted for every staff role (design doc Section 3.9's
 * flagged finding: no route-level role check exists today either) — this gate is a
 * like-for-like swap, not a tightening, and is what makes a future policy change here
 * a Role Defaults edit instead of a code change. */
caseDocumentsRouter.post(
  "/",
  requirePermission("DOCUMENTS.UPLOAD"),
  upload.single("file"),
  documentsController.uploadDocument
);

/** Mounted at /api/documents */
export const documentsRouter = Router();
documentsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
documentsRouter.get("/:id", documentsController.getDocument);
documentsRouter.post(
  "/:id/versions",
  requirePermission("DOCUMENTS.UPLOAD"),
  upload.single("file"),
  documentsController.addVersion
);
documentsRouter.get("/versions/:versionId/download", documentsController.downloadVersion);
/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): soft-deletes, never a real DELETE. */
documentsRouter.delete("/:id", requirePermission("DOCUMENTS.DELETE"), documentsController.deleteDocument);
