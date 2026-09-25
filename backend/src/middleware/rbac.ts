import { Request, Response, NextFunction } from "express";
import { logSecurityEvent, requestContext } from "../utils/securityLogger";

/**
 * SRD Section 8 — Roles & Permission Matrix, enforced at the API layer (never
 * trust client-side hiding alone, per Section 28 Security Requirements).
 * Usage: requireRole("MANAGING_PARTNER", "ASSOCIATE")
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.actor) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.actor.role)) {
      logSecurityEvent("PERMISSION_DENIED", {
        message: `Role ${req.actor.role} is not in the allowed list for this route`,
        actorId: req.actor.sub,
        actorRole: req.actor.role,
        ...requestContext(req),
      });
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (req.actor?.actorType !== "USER") {
    logSecurityEvent("PERMISSION_DENIED", {
      message: "Client actor attempted a staff-only route",
      actorId: req.actor?.sub,
      ...requestContext(req),
    });
    return res.status(403).json({ error: "Staff access only" });
  }
  next();
}

export function requireClient(req: Request, res: Response, next: NextFunction) {
  if (req.actor?.actorType !== "CLIENT") {
    logSecurityEvent("PERMISSION_DENIED", {
      message: "Staff actor attempted a client-only route",
      actorId: req.actor?.sub,
      actorRole: req.actor?.role,
      ...requestContext(req),
    });
    return res.status(403).json({ error: "Client access only" });
  }
  next();
}
