import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireClient } from "../../middleware/rbac";
import * as clientPortalController from "./clientPortal.controller";

/** Client portal routes are gated by requireClient (not requireStaff).
 * Clients can view only their own portal data and update their own profile credentials. */
export const clientPortalRouter = Router();

clientPortalRouter.use(requireAuth, requireClient);

clientPortalRouter.get("/me", clientPortalController.getMyProfile);
clientPortalRouter.patch("/me/profile", clientPortalController.updateMyProfile);
clientPortalRouter.get("/cases", clientPortalController.listMyCases);
clientPortalRouter.get("/cases/:caseId", clientPortalController.getMyCase);
clientPortalRouter.get("/hearings", clientPortalController.listMyHearings);
clientPortalRouter.get("/documents", clientPortalController.listMyDocuments);
clientPortalRouter.get("/documents/:documentId/download", clientPortalController.downloadMyDocument);
