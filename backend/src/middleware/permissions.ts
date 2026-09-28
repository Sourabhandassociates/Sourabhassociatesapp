import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { loadEffectivePermissions } from "../modules/permissions/permissionEvaluator";
import { logSecurityEvent, requestContext } from "../utils/securityLogger";

/**
 * Step 3 M2 — loads the authenticated staff user's effective permission set exactly
 * once and attaches it to `req.actor.effectivePermissions`, mutating the actor
 * object already populated by `requireAuth` rather than adding a separate
 * `req.effectivePermissions` — every downstream controller/service already receives
 * `req.actor`, so the permission set now travels wherever the actor already travels,
 * with no change needed to any existing function signature (design doc Section 2.3).
 *
 * Must run after `requireAuth`. A no-op for Client actors (SRD Section 8a.4 excludes
 * Clients from this system entirely) and memoized against accidental double-wiring
 * (re-running this in the same request would otherwise be exactly the repeated
 * lookup the design doc's performance requirement forbids).
 */
export async function attachEffectivePermissions(req: Request, res: Response, next: NextFunction) {
  if (!req.actor) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.actor.actorType !== "USER") {
    req.actor.effectivePermissions = new Set();
    return next();
  }
  if (req.actor.effectivePermissions) {
    return next();
  }

  req.actor.effectivePermissions = await loadEffectivePermissions(req.actor.sub, req.actor.role as UserRole);
  next();
}

/**
 * The permission-based successor to `middleware/rbac.ts`'s `requireRole` — same
 * shape, same PERMISSION_DENIED security-log pattern, but checking membership in
 * the already-loaded effective-permission set instead of a hardcoded role list.
 * Must run after `attachEffectivePermissions`.
 */
export function requirePermission(key: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.actor) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!req.actor.effectivePermissions?.has(key)) {
      logSecurityEvent("PERMISSION_DENIED", {
        message: `Actor does not hold permission ${key}`,
        actorId: req.actor.sub,
        actorRole: req.actor.role,
        permissionKey: key,
        ...requestContext(req),
      });
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}
