import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireClient } from "../../middleware/rbac";
import * as clientPortalController from "./clientPortal.controller";

/** Client Portal Permissions (2026-08-14). Entirely separate from every staff
 * router — gated by requireClient (not requireStaff), and GET-only: no
 * create/edit/delete route exists here at all, so a client's read-only access is
 * enforced by this router's very shape, not by omitted frontend buttons. */
export const clientPortalRouter = Router();

clientPortalRouter.use(requireAuth, requireClient);

clientPortalRouter.get("/me", clientPortalController.getMyProfile);
clientPortalRouter.get("/cases", clientPortalController.listMyCases);
clientPortalRouter.get("/cases/:caseId", clientPortalController.getMyCase);
clientPortalRouter.get("/hearings", clientPortalController.listMyHearings);
clientPortalRouter.get("/documents", clientPortalController.listMyDocuments);
clientPortalRouter.get("/documents/:documentId/download", clientPortalController.downloadMyDocument);
