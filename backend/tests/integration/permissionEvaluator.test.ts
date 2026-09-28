import { describe, it, expect } from "vitest";
import { prisma } from "../../src/config/prisma";
import { seedPermissionCatalogue } from "../../src/modules/permissions/seedPermissions";
import { loadEffectivePermissions } from "../../src/modules/permissions/permissionEvaluator";
import { createUser } from "../helpers/fixtures";

/**
 * Step 3 M2 — validates the evaluator itself against a real, seeded catalogue:
 * role-default resolution, override precedence (User Override -> Role Default ->
 * Deny), and that removing an override reverts the user to the role default.
 */
describe("loadEffectivePermissions (Step 3 M2 — design doc Section 2.2)", () => {
  it("resolves granted permissions from the role default when no override exists", async () => {
    await seedPermissionCatalogue();
    const associate = await createUser("ASSOCIATE");

    const effective = await loadEffectivePermissions(associate.id, "ASSOCIATE");

    // CASES.VIEW_ASSIGNED is granted to Associate by default (design doc Section 3.4).
    expect(effective.has("CASES.VIEW_ASSIGNED")).toBe(true);
    // CASES.VIEW_ALL is not granted to Associate by default.
    expect(effective.has("CASES.VIEW_ALL")).toBe(false);
  });

  it("denies a permission with no role-default grant and no override", async () => {
    await seedPermissionCatalogue();
    const jrAssociate = await createUser("JUNIOR_ASSOCIATE");

    const effective = await loadEffectivePermissions(jrAssociate.id, "JUNIOR_ASSOCIATE");

    // CASES.CREATE is denied to Junior Associate by default.
    expect(effective.has("CASES.CREATE")).toBe(false);
  });

  it("a GRANT override adds a permission the role default denies", async () => {
    await seedPermissionCatalogue();
    const partner = await createUser("MANAGING_PARTNER");
    const jrAssociate = await createUser("JUNIOR_ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.CREATE" } });

    let effective = await loadEffectivePermissions(jrAssociate.id, "JUNIOR_ASSOCIATE");
    expect(effective.has("CASES.CREATE")).toBe(false);

    await prisma.userPermissionOverride.create({
      data: {
        userId: jrAssociate.id,
        permissionId: permission.id,
        effect: "GRANT",
        reason: "Covering for an Associate on leave",
        setById: partner.id,
      },
    });

    effective = await loadEffectivePermissions(jrAssociate.id, "JUNIOR_ASSOCIATE");
    expect(effective.has("CASES.CREATE")).toBe(true);
  });

  it("a REVOKE override removes a permission the role default grants", async () => {
    await seedPermissionCatalogue();
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.VIEW_ASSIGNED" } });

    let effective = await loadEffectivePermissions(associate.id, "ASSOCIATE");
    expect(effective.has("CASES.VIEW_ASSIGNED")).toBe(true);

    await prisma.userPermissionOverride.create({
      data: {
        userId: associate.id,
        permissionId: permission.id,
        effect: "REVOKE",
        reason: "Temporarily suspended pending review",
        setById: partner.id,
      },
    });

    effective = await loadEffectivePermissions(associate.id, "ASSOCIATE");
    expect(effective.has("CASES.VIEW_ASSIGNED")).toBe(false);
  });

  it("removing an override immediately reverts the user to the role default", async () => {
    await seedPermissionCatalogue();
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.VIEW_ASSIGNED" } });

    const override = await prisma.userPermissionOverride.create({
      data: {
        userId: associate.id,
        permissionId: permission.id,
        effect: "REVOKE",
        reason: "Temporarily suspended pending review",
        setById: partner.id,
      },
    });
    expect((await loadEffectivePermissions(associate.id, "ASSOCIATE")).has("CASES.VIEW_ASSIGNED")).toBe(false);

    await prisma.userPermissionOverride.delete({ where: { id: override.id } });

    expect((await loadEffectivePermissions(associate.id, "ASSOCIATE")).has("CASES.VIEW_ASSIGNED")).toBe(true);
  });

  it("denies a permission that has neither a role-default row nor an override (defensive fail-closed fallback)", async () => {
    // Deliberately does NOT seed the catalogue, and creates a Permission with no
    // RolePermission rows at all — the defensive branch design doc Section 2.2
    // step 3 describes (should not occur in practice once seeding is complete).
    const orphanPermission = await prisma.permission.create({
      data: { key: "TEST.ORPHAN", module: "TEST", action: "ORPHAN", label: "Orphan permission" },
    });
    const associate = await createUser("ASSOCIATE");

    const effective = await loadEffectivePermissions(associate.id, "ASSOCIATE");
    expect(effective.has(orphanPermission.key)).toBe(false);
  });
});
