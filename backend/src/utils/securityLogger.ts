import { Request } from "express";

/**
 * Dedicated, structured logging for security-relevant events — authentication
 * failures, permission denials, rate-limit trips — kept separate from ordinary
 * application logs so they can be shipped to a SIEM/alerting pipeline later
 * without re-plumbing call sites. Deliberately not the same thing as general
 * request logging (IMPROVEMENTS.md #21), which is a broader, separate concern.
 *
 * Output is structured JSON on a single line per event so it's grep/parse-able
 * even before a real log aggregator is wired up.
 */

export type SecurityEventType =
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_ACCOUNT_DISABLED_LOGIN_ATTEMPT"
  | "AUTH_REFRESH_FAILURE"
  | "PERMISSION_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "FILE_UPLOAD_REJECTED"
  /** Milestone 4 (Version 1.0 completion, SRD Section 28 — MFA). */
  | "AUTH_MFA_FAILURE"
  | "AUTH_MFA_BACKUP_CODE_USED";

interface SecurityEventDetails {
  message: string;
  actorId?: string;
  actorRole?: string;
  ip?: string;
  path?: string;
  method?: string;
  [key: string]: unknown;
}

export function logSecurityEvent(type: SecurityEventType, details: SecurityEventDetails): void {
  const entry = {
    level: "security",
    type,
    timestamp: new Date().toISOString(),
    ...details,
  };
  // console.warn (not .log) so these are visually distinct and easy to filter for in any
  // log viewer that separates stdout/stderr or colors warn-level output.
  console.warn(JSON.stringify(entry));
}

export function requestContext(req: Request): { ip?: string; path: string; method: string } {
  return { ip: req.ip, path: req.originalUrl, method: req.method };
}
