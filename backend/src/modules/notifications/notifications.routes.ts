import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import * as notificationsController from "./notifications.controller";

/** Mounted at /api/notifications. No permission gate beyond staff auth — every route
 * is self-scoped to the caller's own userId (notifications.service.ts), so there's
 * nothing a permission check would add. */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireStaff);
notificationsRouter.get("/", notificationsController.listNotifications);
notificationsRouter.get("/unread-count", notificationsController.unreadCount);
notificationsRouter.patch("/:id/read", notificationsController.markRead);
notificationsRouter.patch("/read-all", notificationsController.markAllRead);
