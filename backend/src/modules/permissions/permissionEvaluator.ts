/**
 * Step 3 M2 — Permission Evaluator (STEP3_ROLE_PERMISSION_DESIGN.md Section 2).
 * Resolves a staff user's *effective* permission set: a UserPermissionOverride,
 * when one exists for a given permission, always wins over the role default
 * (GRANT adds it even if the role default is false; REVOKE removes it even if the
 * role default is true); otherwise the role default applies; a permission neither
 * granted by role nor overridden is denied. This is computed once per request (see
 * `middleware/permissions.ts`'s `attachEffectivePermissions`), never once per check.
 */
import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";

/**
 * Two small, independently-indexed queries (RolePermission by role, UserPermission
 * Override by userId) run in parallel — not one query per permission key. This is
 * the "load once per request" the design doc's performance section (9.5/9.6)
 * requires: whatever calls this should call it exactly once per request and reuse
 * the resulting Set for every `requirePermission`/`resolveViewScope` check that
 * follows, never re-querying per check.
 */
export async function loadEffectivePermissions(userId: string, role: UserRole): Promise<Set<string>> {
  const [roleGrants, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role, granted: true },
      select: { permission: { select: { key: true } } },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { effect: true, permission: { select: { key: true } } },
    }),
  ]);

  const effective = new Set(roleGrants.map((rp) => rp.permission.key));
  for (const override of overrides) {
    if (override.effect === "GRANT") {
      effective.add(override.permission.key);
    } else {
      effective.delete(override.permission.key);
    }
  }
  return effective;
}
