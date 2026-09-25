import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { setAuditSessionId } from "../utils/auditContext";

/**
 * SRD Section 9 — every request must carry a valid access token; the frontend
 * refreshes it silently in the background, so a logged-in user is never asked
 * to re-authenticate just because an access token expired mid-session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  try {
    req.actor = verifyAccessToken(token);
    // Firm-wide audit trail expansion — makes this request's session id available to
    // recordAuditLog() everywhere downstream without threading it through every
    // service function; mutates the store the app-level middleware already created.
    setAuditSessionId(req.actor.sessionId);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}
