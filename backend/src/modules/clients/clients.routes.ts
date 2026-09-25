import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as clientsController from "./clients.controller";

export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

clientsRouter.post("/", requirePermission("CLIENTS.CREATE"), clientsController.createClient);
clientsRouter.get("/", clientsController.listClients);
clientsRouter.get("/:id", clientsController.getClient);
clientsRouter.patch("/:id", requirePermission("CLIENTS.EDIT"), clientsController.updateClient);
clientsRouter.patch("/:id/status", requirePermission("CLIENTS.CHANGE_STATUS"), clientsController.setClientStatus);
clientsRouter.patch(
  "/:id/portal-permissions",
  requirePermission("CLIENTS.MANAGE_PORTAL_ACCESS"),
  clientsController.updatePortalPermissions
);
/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): soft-deletes, never a real DELETE. */
clientsRouter.delete("/:id", requirePermission("CLIENTS.DELETE"), clientsController.deleteClient);
