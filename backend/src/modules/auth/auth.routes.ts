import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import { authRateLimit } from "../../middleware/rateLimit";
import * as authController from "./auth.controller";

export const authRouter = Router();

// Credential-guessing surface — a tighter limit than the general API ceiling.
authRouter.post("/login/staff", authRateLimit, authController.staffLogin);
// Milestone 4 (SRD Section 28 — MFA) — the second login step when /login/staff
// returned mfaRequired. Same tight rate limit as the first step (still a
// credential-guessing surface, just for the second factor instead of the password).
authRouter.post("/login/mfa", authRateLimit, authController.verifyMfaLogin);
authRouter.post("/login/client", authRateLimit, authController.clientLogin);
authRouter.post("/refresh", authRateLimit, authController.refresh);
authRouter.post("/logout", requireAuth, authController.logout);
// Inherently "my own data" — no role/permission gate, same as before Step 3.
authRouter.get("/sessions/me", requireAuth, authController.mySessions);
authRouter.post("/sessions/:sessionId/revoke", requireAuth, authController.revokeOwnSession);
authRouter.post(
  "/sessions/:userId/force-logout",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.FORCE_LOGOUT"),
  authController.forceLogoutUser
);
authRouter.get(
  "/sessions/:userId",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("SESSIONS.VIEW_ANY"),
  authController.sessionsForAnyUser
);

// Milestone 4 (SRD Section 28 — MFA) — self-service enrollment/disable, no
// permission gate beyond being an authenticated staff member (every role may opt in;
// mandatory enforcement for Partner/Accounts is a login-flow nudge, not a route gate —
// see auth.service.ts's module-level comment).
authRouter.post("/mfa/enroll/begin", requireAuth, authController.beginMfaEnrollment);
authRouter.post("/mfa/enroll/confirm", requireAuth, authController.confirmMfaEnrollment);
authRouter.post("/mfa/disable", requireAuth, authController.disableMfa);

// Lightweight staff directory (id/name/role only) for assignment pickers — any authenticated staff member can read it, but never a Client.
authRouter.get(
  "/staff-directory",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.VIEW_DIRECTORY"),
  authController.staffDirectory
);

// SRD Section 3.1 — Managing Partner–only user management
authRouter.post(
  "/users",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.CREATE"),
  authController.createUser
);
authRouter.get(
  "/users",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.VIEW"),
  authController.listUsers
);
authRouter.patch(
  "/users/:userId/status",
  requireAuth,
  requireStaff,
  attachEffectivePermissions,
  requirePermission("USERS.EDIT_STATUS"),
  authController.setUserStatus
);
