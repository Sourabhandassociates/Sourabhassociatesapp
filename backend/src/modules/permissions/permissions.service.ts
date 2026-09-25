import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors";
import { recordAuditLog } from "../../utils/auditLog";
import { AuthorizedActor } from "../../utils/jwt";
import { ALL_ROLES } from "./permissionCatalogue";
import { assertRoleDefaultChangeAllowed, assertOverrideAllowed } from "./coreAdminSafety";

/**
 * Step 3 M3 — Permission-Management Admin API (STEP3_ROLE_PERMISSION_DESIGN.md
 * Section 6/11). Everything here is Managing-Partner-only, gated at the route level
 * (`permissions.routes.ts`) by both `USERS.MANAGE_PERMISSIONS` and a hardcoded
 * `requireRole` safety net (Section 9.2) — this module itself does no further role
 * checking beyond the Rule A/Rule B core-admin safeguards, which apply regardless of
 * who is calling.
 */

/** GET /api/permissions/catalogue — the full permission catalogue, for the Role
 * Defaults matrix and Search Permission to render against. */
export async function getCatalogue() {
  return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
}

/** GET /api/permissions/role-defaults — the full dense RolePermission matrix. */
export async function getRoleDefaults() {
  const rows = await prisma.rolePermission.findMany({
    include: { permission: true },
    orderBy: [{ permission: { module: "asc" } }, { permission: { action: "asc" } }, { role: "asc" }],
  });
  return rows.map((row) => ({
    role: row.role,
    granted: row.granted,
    updatedAt: row.updatedAt,
    permission: {
      id: row.permission.id,
      key: row.permission.key,
      label: row.permission.label,
      module: row.permission.module,
      isCoreAdmin: row.permission.isCoreAdmin,
      isViewScope: row.permission.isViewScope,
    },
  }));
}

export interface RoleDefaultChangeInput {
  role: UserRole;
  permissionKey: string;
  granted: boolean;
}

/**
 * PATCH /api/permissions/role-defaults — bulk role-default edit. Every change is
 * validated (unknown role/key, Rule A) before any write is attempted; only changes
 * that actually flip a value are applied and audit-logged, so a resubmission of an
 * already-current value is a silent no-op rather than log noise, matching the
 * project's existing convention (e.g. Task reassignment only logs when
 * `assignedToId` actually changes). The write itself is one transaction — either
 * every actual change lands, or none do.
 */
export async function updateRoleDefaults(actor: AuthorizedActor, changes: RoleDefaultChangeInput[]) {
  if (changes.length === 0) return { updated: 0 };

  const keys = [...new Set(changes.map((c) => c.permissionKey))];
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
  const permissionByKey = new Map(permissions.map((p) => [p.key, p]));

  for (const change of changes) {
    if (!ALL_ROLES.includes(change.role)) {
      throw new BadRequestError(`Unknown role: ${change.role}`);
    }
    const permission = permissionByKey.get(change.permissionKey);
    if (!permission) {
      throw new BadRequestError(`Unknown permission key: ${change.permissionKey}`);
    }
    // Rule A (design doc Section 9.3) — the Managing Partner role's own default can
    // never be revoked for a core-admin permission. Throws ForbiddenError.
    assertRoleDefaultChangeAllowed(change.role, permission.isCoreAdmin, change.granted);
  }

  const currentRows = await prisma.rolePermission.findMany({
    where: { OR: changes.map((c) => ({ role: c.role, permissionId: permissionByKey.get(c.permissionKey)!.id })) },
  });
  const currentByRolePermission = new Map(currentRows.map((row) => [`${row.role}:${row.permissionId}`, row]));

  const actualChanges = changes.filter((change) => {
    const permission = permissionByKey.get(change.permissionKey)!;
    const current = currentByRolePermission.get(`${change.role}:${permission.id}`);
    return current !== undefined && current.granted !== change.granted;
  });

  if (actualChanges.length > 0) {
    await prisma.$transaction(
      actualChanges.map((change) => {
        const permission = permissionByKey.get(change.permissionKey)!;
        return prisma.rolePermission.update({
          where: { role_permissionId: { role: change.role, permissionId: permission.id } },
          data: { granted: change.granted, updatedById: actor.sub },
        });
      })
    );

    for (const change of actualChanges) {
      const permission = permissionByKey.get(change.permissionKey)!;
      const previous = currentByRolePermission.get(`${change.role}:${permission.id}`)!;
      await recordAuditLog(actor, "ROLE_PERMISSION_CHANGED", "RolePermission", `${change.role}:${permission.key}`, {
        entityName: `${permission.key} (${change.role})`,
        details: `${previous.granted} -> ${change.granted}`,
        changes: { granted: { old: previous.granted, new: change.granted } },
      });
    }
  }

  return { updated: actualChanges.length };
}

export interface EmployeePermissionEntry {
  permission: { id: string; key: string; label: string; module: string; isCoreAdmin: boolean };
  roleDefault: boolean;
  override: { effect: "GRANT" | "REVOKE"; reason: string; setBy: { id: string; name: string }; setAt: Date } | null;
  granted: boolean;
  source: "role-default" | "override";
}

/**
 * GET /api/permissions/employees/:userId — Permission Summary (design doc Section
 * 6.3): role, every role-default permission, every override, and the merged
 * effective grant, each entry explicitly tagged with its source so "inherited" vs.
 * "overridden" never has to be inferred by the caller. Also backs the Employee
 * Overrides tab's "view effective permissions" requirement — one payload serves
 * both screens, matching the design doc's shared-component intent (Section 6.3).
 */
export async function getEmployeePermissionSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!user) throw new NotFoundError("User not found");

  const [roleDefaults, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role: user.role },
      include: { permission: true },
      orderBy: [{ permission: { module: "asc" } }, { permission: { action: "asc" } }],
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true, setBy: { select: { id: true, name: true } } },
    }),
  ]);

  const overrideByPermissionId = new Map(overrides.map((o) => [o.permissionId, o]));

  const effective: EmployeePermissionEntry[] = roleDefaults.map((row) => {
    const override = overrideByPermissionId.get(row.permissionId);
    return {
      permission: {
        id: row.permission.id,
        key: row.permission.key,
        label: row.permission.label,
        module: row.permission.module,
        isCoreAdmin: row.permission.isCoreAdmin,
      },
      roleDefault: row.granted,
      override: override
        ? { effect: override.effect, reason: override.reason, setBy: override.setBy, setAt: override.setAt }
        : null,
      granted: override ? override.effect === "GRANT" : row.granted,
      source: override ? "override" : "role-default",
    };
  });

  return { user, effective };
}

export interface SetOverrideInput {
  permissionKey: string;
  effect: "GRANT" | "REVOKE";
  reason: string;
}

/**
 * POST /api/permissions/employees/:userId/overrides — creates a new override.
 * Rejects a duplicate (an override already exists for this user/permission — the
 * caller must remove it first, matching the Employee Overrides UI's own shape,
 * design doc Section 6.2: existing-override rows offer Remove, not a second Grant).
 */
export async function createOverride(actor: AuthorizedActor, targetUserId: string, input: SetOverrideInput) {
  const reason = input.reason.trim();
  if (!reason) throw new BadRequestError("A reason is required");

  const [targetUser, permission] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId } }),
    prisma.permission.findUnique({ where: { key: input.permissionKey } }),
  ]);
  if (!targetUser) throw new NotFoundError("User not found");
  if (!permission) throw new BadRequestError(`Unknown permission key: ${input.permissionKey}`);

  // Rule B (design doc Section 9.3) — no REVOKE override on a core-admin permission
  // may target a Managing-Partner-role user. Throws ForbiddenError.
  assertOverrideAllowed(targetUser.role, permission.isCoreAdmin, input.effect);

  const existing = await prisma.userPermissionOverride.findUnique({
    where: { userId_permissionId: { userId: targetUserId, permissionId: permission.id } },
  });
  if (existing) {
    throw new ConflictError(
      `An override already exists for ${permission.key} on this employee — remove it before setting a new one.`
    );
  }

  const created = await prisma.userPermissionOverride.create({
    data: { userId: targetUserId, permissionId: permission.id, effect: input.effect, reason, setById: actor.sub },
  });

  await recordAuditLog(
    actor,
    input.effect === "GRANT" ? "USER_PERMISSION_OVERRIDE_GRANTED" : "USER_PERMISSION_OVERRIDE_REVOKED",
    "UserPermissionOverride",
    created.id,
    { entityName: `${permission.key} (${targetUser.name})`, details: reason }
  );

  return created;
}

/** DELETE /api/permissions/employees/:userId/overrides/:permissionKey — reverts a
 * single permission back to the role default. */
export async function removeOverride(actor: AuthorizedActor, targetUserId: string, permissionKey: string) {
  const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
  if (!permission) throw new BadRequestError(`Unknown permission key: ${permissionKey}`);

  const existing = await prisma.userPermissionOverride.findUnique({
    where: { userId_permissionId: { userId: targetUserId, permissionId: permission.id } },
  });
  if (!existing) throw new NotFoundError("No override exists for this employee and permission");

  await prisma.userPermissionOverride.delete({ where: { id: existing.id } });

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  await recordAuditLog(actor, "USER_PERMISSION_OVERRIDE_REMOVED", "UserPermissionOverride", existing.id, {
    entityName: `${permission.key} (${targetUser?.name ?? targetUserId})`,
    details: `was ${existing.effect}`,
  });
}

/**
 * POST /api/permissions/employees/:userId/reset — bulk-removes every override for
 * an employee in one action, writing a single USER_PERMISSIONS_RESET audit entry
 * rather than N individual removal entries (design doc Section 6.2/9.4).
 */
export async function resetEmployeeToRoleDefaults(actor: AuthorizedActor, targetUserId: string) {
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new NotFoundError("User not found");

  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: targetUserId },
    include: { permission: true },
  });
  if (overrides.length === 0) return { removed: 0 };

  await prisma.userPermissionOverride.deleteMany({ where: { userId: targetUserId } });

  const keys = overrides.map((o) => o.permission.key);
  await recordAuditLog(actor, "USER_PERMISSIONS_RESET", "User", targetUserId, {
    entityName: targetUser.name,
    details: `Removed ${keys.length} override(s): ${keys.join(", ")}`,
  });

  return { removed: overrides.length };
}
