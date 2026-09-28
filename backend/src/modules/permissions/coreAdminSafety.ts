/**
 * Step 3 — Managing Partner Safety (STEP3_ROLE_PERMISSION_DESIGN.md Section 9.3).
 * Two absolute, O(1) rules — no "count active Managing Partners" query, which
 * would be vulnerable to a race between two concurrent writes each independently
 * observing "someone else still has it." Reusable service-layer functions; M3's
 * admin API calls these before committing any RolePermission/UserPermissionOverride
 * write. Both throw ForbiddenError (never silently no-op) so a caller can never
 * mistake a blocked write for a successful one.
 */
import { UserRole } from "@prisma/client";
import { ForbiddenError } from "../../utils/errors";

/**
 * Rule A — the Managing Partner role's own RolePermission default can never be set
 * to `granted: false` for a core-admin permission. RolePermission is role-*wide*,
 * so allowing this would strip the permission from every current and future
 * Managing Partner in one action; there is no "how many MPs exist" count that makes
 * that safe.
 */
export function assertRoleDefaultChangeAllowed(role: UserRole, isCoreAdmin: boolean, granted: boolean): void {
  if (role === "MANAGING_PARTNER" && isCoreAdmin && !granted) {
    throw new ForbiddenError(
      "This permission is required for Managing Partner accountability and cannot be removed from the Managing Partner role's defaults."
    );
  }
}

/**
 * Rule B — no UserPermissionOverride may REVOKE a core-admin permission from a
 * Managing-Partner-role user, unconditionally (not "unless other MPs still have
 * it," which would need a live count and be racy). Stripping a specific Managing
 * Partner's administrative power is a role change (`User.role`), not a permission
 * exception — a Managing Partner without administrative power is a role mismatch,
 * not something this override system is meant to express.
 */
export function assertOverrideAllowed(targetUserRole: UserRole, isCoreAdmin: boolean, effect: "GRANT" | "REVOKE"): void {
  if (targetUserRole === "MANAGING_PARTNER" && isCoreAdmin && effect === "REVOKE") {
    throw new ForbiddenError(
      "Core-admin permissions cannot be revoked from a Managing Partner by override. Change the user's role instead if this is truly intended."
    );
  }
}
