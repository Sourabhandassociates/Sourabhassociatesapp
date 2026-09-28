/**
 * Step 3 M1 — Schema & Seed. Populates `Permission` from the catalogue and
 * `RolePermission` as a dense matrix (every role x permission pair gets a row —
 * STEP3_ROLE_PERMISSION_DESIGN.md Section 1.2) from each permission's seeded
 * defaults. Idempotent (upsert throughout), matching this codebase's existing
 * seed conventions (`scripts/seed.ts`'s `seedCaseStages`/`seedDocumentCategories`)
 * so re-running it is always safe. Seeds zero `UserPermissionOverride` rows — the
 * system launches in its purest "role defaults only" state (design doc Section 7.1).
 */
import { prisma } from "../../config/prisma";
import { ALL_ROLES, PERMISSION_CATALOGUE } from "./permissionCatalogue";

export interface SeedPermissionCatalogueResult {
  permissionCount: number;
  roleGrantCount: number;
}

export async function seedPermissionCatalogue(): Promise<SeedPermissionCatalogueResult> {
  let permissionCount = 0;
  let roleGrantCount = 0;

  for (const def of PERMISSION_CATALOGUE) {
    const permission = await prisma.permission.upsert({
      where: { key: def.key },
      update: {
        module: def.module,
        action: def.action,
        label: def.label,
        isViewScope: def.isViewScope ?? false,
        isCoreAdmin: def.isCoreAdmin ?? false,
      },
      create: {
        key: def.key,
        module: def.module,
        action: def.action,
        label: def.label,
        isViewScope: def.isViewScope ?? false,
        isCoreAdmin: def.isCoreAdmin ?? false,
      },
    });
    permissionCount += 1;

    for (const role of ALL_ROLES) {
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        // Never overwrite a Managing-Partner-edited default on re-seed — the seed
        // script establishes the *initial* state (design doc Section 7.1 step 3),
        // it must not silently clobber a role-default change made afterward
        // through the Role Defaults screen (M4). Only a row that doesn't exist
        // yet (a newly added permission, or the very first run) gets created.
        update: {},
        create: { role, permissionId: permission.id, granted: def.defaults[role] },
      });
      roleGrantCount += 1;
    }
  }

  return { permissionCount, roleGrantCount };
}
