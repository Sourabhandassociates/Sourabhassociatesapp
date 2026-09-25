import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { getAuditContext } from "./auditContext";

/**
 * SRD Section 29 — persisted, queryable audit trail (distinct from securityLogger.ts,
 * which is unpersisted console output for authn/authz *security* events). This is the
 * business record of "who did what to which entity, when" — Step 2's Recycle Bin
 * restore/delete history and Step 3's permission-change history both build on this.
 *
 * Deliberately generic (entityType/entityId as strings, no per-entity FK) so a new
 * module can start logging to it without a schema migration.
 *
 * Never throws: an audit-log write failure must not block the business operation it's
 * describing. A failure here is logged to stderr for operational visibility instead.
 */

/**
 * A narrower shape than `AccessTokenPayload`/`AuthorizedActor` — both already satisfy
 * this structurally, so every existing caller keeps compiling unchanged. `sub` is
 * nullable only for the pre-auth case (a failed login attempt against an email that
 * doesn't correspond to any user has no real actor id to attribute the row to).
 */
export interface AuditActor {
  sub: string | null;
  role?: string;
}

export interface RecordAuditLogOptions {
  entityName?: string;
  details?: string;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  /** Explicit override — otherwise pulled from the request's AsyncLocalStorage context. */
  ipAddress?: string;
  /** Explicit override — needed at login-success time, before a new session id is on
   * req.actor/the ALS context yet. Otherwise pulled from the request's context. */
  sessionId?: string;
}

export async function recordAuditLog(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId?: string,
  options?: RecordAuditLogOptions
): Promise<void> {
  try {
    const context = getAuditContext();
    await prisma.auditLog.create({
      data: {
        userId: actor.sub,
        userRole: actor.role ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        entityName: options?.entityName ?? null,
        details: options?.details ?? null,
        changes: options?.changes
          ? (options.changes as unknown as Prisma.InputJsonValue)
          : undefined,
        ipAddress: options?.ipAddress ?? context?.ip ?? null,
        sessionId: options?.sessionId ?? context?.sessionId ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log entry", { action, entityType, entityId, err });
  }
}

/**
 * Fields whose value must never appear in an audit-log diff, even if a caller passes a
 * whole before/after record without hand-picking safe fields first. Defense-in-depth:
 * callers *should* already only diff business fields, but a mistake here must never
 * leak a credential into a table that's explicitly meant to be broadly readable by
 * Managing Partner/Accounts Team.
 */
const SENSITIVE_FIELD_NAMES = new Set<string>([
  "passwordHash",
  "mfaSecretEncrypted",
  "mfaBackupCodesHashed",
  "refreshTokenHash",
]);

/** Comparable form — Date objects compare by instant, not reference. */
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return value;
}

/** JSON-storable form — Prisma's `Json` column type only accepts JSON-serializable
 * values, so a raw `Date` (not valid JSON on its own) must become an ISO string
 * before it can be written into `changes`. */
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

/**
 * Produces a structured `{ field: { old, new } }` diff for exactly the fields that
 * actually changed — never an empty object. Returns `null` (not `{}`) when nothing
 * changed, so a caller can skip the audit write entirely on a no-op update rather than
 * recording a row that says nothing happened.
 */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of keys) {
    if (SENSITIVE_FIELD_NAMES.has(key)) continue;
    if (comparable(before[key]) !== comparable(after[key])) {
      changes[key] = { old: jsonSafe(before[key]), new: jsonSafe(after[key]) };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
