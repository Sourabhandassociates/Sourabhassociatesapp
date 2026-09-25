import { AuthorizedActor } from "../../utils/jwt";

export type ViewScope = "ALL" | "ASSIGNED" | "OWN" | "NONE";

/**
 * Step 3 M2 — STEP3_ROLE_PERMISSION_DESIGN.md Section 4. Decides which of a
 * module's VIEW_ALL/VIEW_ASSIGNED/VIEW_OWN permissions the actor holds — the
 * *only* thing this function decides. Building the actual Prisma `where` clause for
 * each tier stays entirely with the calling service (unchanged from today's
 * `caseScopeWhere`/`clientScopeWhere` OR-filters) — this function replaces the
 * hardcoded role-array check those functions used to gate that filter on, nothing
 * else about them.
 *
 * Reads the already-loaded `actor.effectivePermissions` (attached once per request
 * by `middleware/permissions.ts`'s `attachEffectivePermissions`) — no DB query here.
 * VIEW_ALL takes precedence over VIEW_ASSIGNED over VIEW_OWN if an actor somehow
 * holds more than one (defensive; the Role Defaults UI, M4, prevents that
 * combination from being configured in the first place).
 */
export function resolveViewScope(actor: AuthorizedActor, module: string): ViewScope {
  const granted = actor.effectivePermissions ?? new Set<string>();
  if (granted.has(`${module}.VIEW_ALL`)) return "ALL";
  if (granted.has(`${module}.VIEW_ASSIGNED`)) return "ASSIGNED";
  if (granted.has(`${module}.VIEW_OWN`)) return "OWN";
  return "NONE";
}
