
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import {
  attachEffectivePermissions,
  requirePermission,
  requireAnyPermission,
} from "../../middleware/permissions";
import { authRateLimit } from "../../middleware/rateLimit";
import * as authController from "./auth.controller";

export const authRouter = Router();

// Staff login
authRouter.post(
  "/login/staff",
  authRateLimit,
  authController.staffLogin
);

// MFA login
authRouter.post(
  "/login/mfa",
  authRateLimit,
  authController.verifyMfaLogin
);

// Client login
authRouter.post(
  "/login/client",
  authRateLimit,
  authController.clientLogin
);

// Refresh token
authRouter.post(
  "/refresh",
  authRateLimit,
  authController.refresh
);

// Logout
authRouter.post(
  "/logout",
  requireAuth,
  authController.logout
);

// Own sessions
authRouter.get(
  "/sessions/me",
  requireAuth,
  authController.mySessions
);

authRouter.post(
  "/sessions/:sessionId/revoke",
  requireAuth,
  authController.revokeOwnSession
);

// Force logout a user
authRouter.post(
  "/sessions/:userId/force-logout",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.FORCE_LOGOUT"),
  authController.forceLogoutUser
);

// View sessions for any user
authRouter.get(
  "/sessions/:userId",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("SESSIONS.VIEW_ANY"),
  authController.sessionsForAnyUser
);

// MFA enrollment
authRouter.post(
  "/mfa/enroll/begin",
  requireAuth,
  authController.beginMfaEnrollment
);

authRouter.post(
  "/mfa/enroll/confirm",
  requireAuth,
  authController.confirmMfaEnrollment
);

authRouter.post(
  "/mfa/disable",
  requireAuth,
  authController.disableMfa
);

// Staff directory
authRouter.get(
  "/staff-directory",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requireAnyPermission("USERS.VIEW_DIRECTORY", "TASKS.ASSIGN"),
  authController.staffDirectory
);

// Create user
authRouter.post(
  "/users",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.CREATE"),
  authController.createUser
);

// List users
authRouter.get(
  "/users",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.VIEW"),
  authController.listUsers
);

// Update user status
authRouter.patch(
  "/users/:userId/status",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.EDIT_STATUS"),
  authController.setUserStatus
);

// Delete user
authRouter.delete(
  "/users/:userId",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.DELETE"),
  authController.deleteUser
);


