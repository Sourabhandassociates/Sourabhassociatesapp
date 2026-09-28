import { describe, it, expect } from "vitest";
import { prisma } from "../../src/config/prisma";
import { seedPermissionCatalogue } from "../../src/modules/permissions/seedPermissions";
import { ALL_ROLES, PERMISSION_CATALOGUE, CORE_ADMIN_PERMISSION_KEYS } from "../../src/modules/permissions/permissionCatalogue";

/**
 * Step 3 M1 — Schema & Seed. These tests validate the seed script itself, not any
 * route (none reads this data yet — see STEP3_ROLE_PERMISSION_DESIGN.md Section
 * 11, M1). Each test seeds explicitly rather than relying on global setup, matching
 * this suite's per-test-fixture convention (tests/setup.ts truncates Permission/
 * RolePermission/UserPermissionOverride before every test, same as every other
 * table, for full isolation).
 */
describe("Step 3 M1 — Permission catalogue seed", () => {
  // 53 at M1, +1 (TASKS.CHANGE_STATUS) added when M2 completed body-aware
  // authorization for PATCH /api/tasks/:id — status changes previously shared
  // TASKS.EDIT/TASKS.ASSIGN's "no gate at all" behavior and needed their own key to
  // be distinguished from field edits and reassignment. 54 at Step 4. +7 at Milestone
  // 1 (Version 1.0 completion) — CASES.REASSIGN plus the six CONTACTS.* keys. +14 at
  // Milestone 2 — TIMELOGS.* (4), EXPENSES.* (6), BILLING.* (4). +1 at Milestone 3 —
  // DATA_IMPORT.RUN (Global Search/Reports reuse existing view-scope/REPORTS keys).
  // +6 at Milestone 4 — FIRM_PROFILE.* (2), ANNOUNCEMENTS.* (2), CUSTOM_FIELDS.MANAGE,
  // SESSIONS.VIEW_ANY. +1 at Client Portal Permissions (2026-08-14) —
  // CLIENTS.MANAGE_PORTAL_ACCESS. +14 at the ACCOUNTS module (2026-08-14) — 97. +7 at
  // Case Section Access (2026-08-17) — CASE_OVERVIEW.VIEW, CASE_DOCUMENTS.VIEW,
  // CASE_TASKS.VIEW, CASE_HEARINGS.VIEW, CASE_TIMELINE.VIEW, CASE_BILLING_EXPENSES.VIEW,
  // CASE_ACCOUNTS.VIEW (CASE_NOTES.VIEW already existed and was reused, not
  // duplicated) — 104. +2 at Facts & Arguments case sections (2026-08-18) —
  // CASE_FACTS.VIEW, CASE_ARGUMENTS.VIEW — 106.
  it("creates exactly the 106-key catalogue, with no duplicates", async () => {
    await seedPermissionCatalogue();

    const permissions = await prisma.permission.findMany();
    expect(permissions).toHaveLength(106);
    expect(permissions).toHaveLength(PERMISSION_CATALOGUE.length);

    const keys = permissions.map((p) => p.key).sort();
    const expectedKeys = PERMISSION_CATALOGUE.map((p) => p.key).sort();
    expect(keys).toEqual(expectedKeys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flags exactly 46 permissions as isCoreAdmin (15 at Step 4, +2 at Milestone 1 — CONTACTS.RESTORE/PERMANENT_DELETE, +2 at Milestone 2 — EXPENSES.RESTORE/PERMANENT_DELETE, +3 at Milestone 4 — FIRM_PROFILE.MANAGE/CUSTOM_FIELDS.MANAGE/SESSIONS.VIEW_ANY, +14 at the ACCOUNTS module — all 14 ACCOUNTS.* keys, +8 at Case Section Access (2026-08-17) — the eight CASE_*.VIEW keys, +2 at Facts & Arguments (2026-08-18) — CASE_FACTS.VIEW/CASE_ARGUMENTS.VIEW, per the Managing Partner's explicit \"must never lose access to any Case section\" requirement)", async () => {
    await seedPermissionCatalogue();

    const coreAdmin = await prisma.permission.findMany({ where: { isCoreAdmin: true } });
    expect(coreAdmin).toHaveLength(46);

    const coreAdminKeys = coreAdmin.map((p) => p.key).sort();
    expect(coreAdminKeys).toEqual([...CORE_ADMIN_PERMISSION_KEYS].sort());
    expect(coreAdminKeys).toEqual(
      [
        "ACCOUNTS.VIEW",
        "ACCOUNTS.CREATE_PAYMENT",
        "ACCOUNTS.EDIT_PAYMENT",
        "ACCOUNTS.DELETE_PAYMENT",
        "ACCOUNTS.VIEW_EXPENSES",
        "ACCOUNTS.CREATE_EXPENSE",
        "ACCOUNTS.EDIT_EXPENSE",
        "ACCOUNTS.DELETE_EXPENSE",
        "ACCOUNTS.VIEW_INVOICE",
        "ACCOUNTS.CREATE_INVOICE",
        "ACCOUNTS.EDIT_INVOICE",
        "ACCOUNTS.DELETE_INVOICE",
        "ACCOUNTS.VIEW_REPORTS",
        "ACCOUNTS.MANAGE_FEE",
        "AUDIT_LOG.VIEW_ALL",
        "CASES.PERMANENT_DELETE",
        "CASES.RESTORE",
        "CLIENTS.PERMANENT_DELETE",
        "CLIENTS.RESTORE",
        "CONTACTS.PERMANENT_DELETE",
        "CONTACTS.RESTORE",
        "CUSTOM_FIELDS.MANAGE",
        "DOCUMENTS.PERMANENT_DELETE",
        "DOCUMENTS.RESTORE",
        "EXPENSES.PERMANENT_DELETE",
        "EXPENSES.RESTORE",
        "FIRM_PROFILE.MANAGE",
        "RECYCLE_BIN.VIEW",
        "SESSIONS.VIEW_ANY",
        "SETTINGS.MANAGE",
        "TASKS.PERMANENT_DELETE",
        "TASKS.RESTORE",
        "USERS.CREATE",
        "USERS.EDIT_STATUS",
        "USERS.MANAGE_PERMISSIONS",
        "USERS.VIEW",
        "CASE_OVERVIEW.VIEW",
        "CASE_DOCUMENTS.VIEW",
        "CASE_TASKS.VIEW",
        "CASE_HEARINGS.VIEW",
        "CASE_TIMELINE.VIEW",
        "CASE_NOTES.VIEW",
        "CASE_BILLING_EXPENSES.VIEW",
        "CASE_ACCOUNTS.VIEW",
        "CASE_FACTS.VIEW",
        "CASE_ARGUMENTS.VIEW",
      ].sort()
    );
  });

  it("seeds a dense RolePermission matrix — every (role, permission) pair present, exactly once", async () => {
    await seedPermissionCatalogue();

    const rolePermissions = await prisma.rolePermission.findMany();
    expect(rolePermissions).toHaveLength(106 * ALL_ROLES.length);

    const permissions = await prisma.permission.findMany();
    for (const permission of permissions) {
      for (const role of ALL_ROLES) {
        const rows = rolePermissions.filter((rp) => rp.role === role && rp.permissionId === permission.id);
        expect(rows, `expected exactly one RolePermission row for (${role}, ${permission.key})`).toHaveLength(1);
      }
    }
  });

  it("grants every isCoreAdmin permission to MANAGING_PARTNER by default (Managing Partner Safety, design doc Section 9.3)", async () => {
    await seedPermissionCatalogue();

    const coreAdminPermissions = await prisma.permission.findMany({ where: { isCoreAdmin: true } });
    const mpRolePermissions = await prisma.rolePermission.findMany({
      where: { role: "MANAGING_PARTNER", permissionId: { in: coreAdminPermissions.map((p) => p.id) } },
    });

    expect(mpRolePermissions).toHaveLength(coreAdminPermissions.length);
    expect(mpRolePermissions.every((rp) => rp.granted === true)).toBe(true);
  });

  it("preserves current application behavior for the flagged discrepancies (design doc Section 3.6/3.9)", async () => {
    await seedPermissionCatalogue();

    // Real finding: PATCH /api/tasks/:id has no requireRole today, so Office Staff
    // can currently edit/reassign/status-change any task it can reach — preserved,
    // not tightened, across all three of the now-distinct TASKS.EDIT/
    // CHANGE_STATUS/ASSIGN keys.
    for (const key of ["TASKS.EDIT", "TASKS.CHANGE_STATUS", "TASKS.ASSIGN"]) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      const officeStaffGrant = await prisma.rolePermission.findUniqueOrThrow({
        where: { role_permissionId: { role: "OFFICE_STAFF", permissionId: permission.id } },
      });
      expect(officeStaffGrant.granted, `expected OFFICE_STAFF to hold ${key} by default`).toBe(true);
    }

    // Real finding: neither upload route has requireRole today — every role that
    // can reach a case can upload, including Accounts Team.
    const documentsUpload = await prisma.permission.findUniqueOrThrow({ where: { key: "DOCUMENTS.UPLOAD" } });
    const accountsUpload = await prisma.rolePermission.findUniqueOrThrow({
      where: { role_permissionId: { role: "ACCOUNTS_TEAM", permissionId: documentsUpload.id } },
    });
    expect(accountsUpload.granted).toBe(true);
  });

  it("seeds zero UserPermissionOverride rows — the system launches in its purest role-defaults-only state", async () => {
    await seedPermissionCatalogue();
    const overrides = await prisma.userPermissionOverride.findMany();
    expect(overrides).toHaveLength(0);
  });

  it("is idempotent and never overwrites a role-default value changed after the initial seed", async () => {
    await seedPermissionCatalogue();

    const casesEdit = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.EDIT" } });
    // Simulate a Managing Partner having since changed this role default through
    // the (not-yet-built) Role Defaults screen.
    await prisma.rolePermission.update({
      where: { role_permissionId: { role: "OFFICE_STAFF", permissionId: casesEdit.id } },
      data: { granted: true },
    });

    // Re-running the seed script (e.g. on a fresh deploy) must not clobber that change.
    await seedPermissionCatalogue();

    const afterReseed = await prisma.rolePermission.findUniqueOrThrow({
      where: { role_permissionId: { role: "OFFICE_STAFF", permissionId: casesEdit.id } },
    });
    expect(afterReseed.granted).toBe(true);

    const permissions = await prisma.permission.count();
    const rolePermissions = await prisma.rolePermission.count();
    expect(permissions).toBe(106);
    expect(rolePermissions).toBe(106 * ALL_ROLES.length);
  });
});
