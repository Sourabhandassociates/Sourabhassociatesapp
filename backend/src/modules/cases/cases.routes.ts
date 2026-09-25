import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as casesController from "./cases.controller";

export const casesRouter = Router();

/** Step 3 M2 — loads the effective permission set once per request, consumed by
 * requirePermission below and by caseScopeWhere's view-scope decision for the
 * unrestricted GET routes (STEP3_ROLE_PERMISSION_DESIGN.md Section 11, M2). GET / and
 * GET /:id carry no requirePermission gate, matching today's behavior exactly — access
 * is controlled entirely by row-level scoping (caseScopeWhere/assertCaseAccess), never
 * by a route-level permission check, same as before this cutover. */
casesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

casesRouter.post("/", requirePermission("CASES.CREATE"), casesController.createCase);
casesRouter.get("/", casesController.listCases);
/** Case Section Access (2026-08-17) — registered before "/:id" so it isn't
 * swallowed as a case id. */
casesRouter.get("/section-permissions", casesController.getSectionPermissions);
casesRouter.get("/:id", casesController.getCase);
casesRouter.patch("/:id", requirePermission("CASES.EDIT"), casesController.updateCase);
casesRouter.patch("/:id/status", requirePermission("CASES.CHANGE_STATUS"), casesController.setCaseStatus);
casesRouter.post("/:id/advocates", requirePermission("CASES.MANAGE_ADVOCATES"), casesController.addAdvocate);
casesRouter.delete(
  "/:id/advocates/:userId",
  requirePermission("CASES.MANAGE_ADVOCATES"),
  casesController.removeAdvocate
);
/** Milestone 1 (Version 1.0 completion, SRD Section 10.3 — Tagging System). */
casesRouter.post("/:id/tags", requirePermission("CASES.EDIT"), casesController.addTag);
casesRouter.delete("/:id/tags/:tag", requirePermission("CASES.EDIT"), casesController.removeTag);
/** Milestone 1 (SRD Section 10.1 — "Case reassignment workflow (Partner-only)"). */
casesRouter.patch("/:id/reassign", requirePermission("CASES.REASSIGN"), casesController.reassignPartner);
/**
 * Facts & Arguments case sections (2026-08-18) — §10/§11. Each dedicated
 * endpoint is gated by its own Case Section permission alone (this codebase's
 * Case Section Access architecture has no separate view/edit split for content
 * sections without their own entity-level CRUD permission — see the service-
 * layer comment above updateFacts/updateArguments). assertCaseAccess (row-level
 * case authorization) runs inside every one of the four service functions
 * these call, layered underneath this permission check, never replaced by it.
 */
casesRouter.get("/:id/facts", requirePermission("CASE_FACTS.VIEW"), casesController.getFacts);
casesRouter.patch("/:id/facts", requirePermission("CASE_FACTS.VIEW"), casesController.updateFacts);
casesRouter.get("/:id/arguments", requirePermission("CASE_ARGUMENTS.VIEW"), casesController.getArguments);
casesRouter.patch("/:id/arguments", requirePermission("CASE_ARGUMENTS.VIEW"), casesController.updateArguments);
/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): soft-deletes, never a real DELETE. */
casesRouter.delete("/:id", requirePermission("CASES.DELETE"), casesController.deleteCase);
