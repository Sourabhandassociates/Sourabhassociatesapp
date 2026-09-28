import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as announcementsController from "./announcements.controller";

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
announcementsRouter.get("/", requirePermission("ANNOUNCEMENTS.VIEW"), announcementsController.listAnnouncements);
announcementsRouter.post("/", requirePermission("ANNOUNCEMENTS.CREATE"), announcementsController.createAnnouncement);
announcementsRouter.get("/:id", requirePermission("ANNOUNCEMENTS.VIEW"), announcementsController.getAnnouncement);
announcementsRouter.get("/:id/read-tracking", requirePermission("ANNOUNCEMENTS.VIEW"), announcementsController.getReadTracking);
announcementsRouter.patch("/:id/read", requirePermission("ANNOUNCEMENTS.VIEW"), announcementsController.markAnnouncementRead);
announcementsRouter.patch("/:id/active", requirePermission("ANNOUNCEMENTS.CREATE"), announcementsController.setAnnouncementActive);
