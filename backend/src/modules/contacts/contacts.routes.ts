import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as contactsController from "./contacts.controller";

export const contactsRouter = Router();

contactsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

contactsRouter.post("/", requirePermission("CONTACTS.CREATE"), contactsController.createContact);
contactsRouter.get("/", requirePermission("CONTACTS.VIEW"), contactsController.listContacts);
/** Auto-synced Client Contacts directory (Contacts redesign pass, 2026-08-07b) —
 * must be registered before "/:id" or Express would treat "client-directory" as an id. */
contactsRouter.get("/client-directory", requirePermission("CONTACTS.VIEW"), contactsController.listClientDirectory);
contactsRouter.get("/:id", requirePermission("CONTACTS.VIEW"), contactsController.getContact);
contactsRouter.patch("/:id", requirePermission("CONTACTS.EDIT"), contactsController.updateContact);
/** Milestone 1 — soft-deletes, never a real DELETE (SRD Section 27). */
contactsRouter.delete("/:id", requirePermission("CONTACTS.DELETE"), contactsController.deleteContact);
contactsRouter.post("/:id/matters", requirePermission("CONTACTS.EDIT"), contactsController.linkMatter);
contactsRouter.delete("/:id/matters/:caseId", requirePermission("CONTACTS.EDIT"), contactsController.unlinkMatter);
