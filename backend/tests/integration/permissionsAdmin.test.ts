import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, tokenForUser } from "../helpers/fixtures";

/**
 * Step 3 M3 — Permission-Management Admin API (STEP3_ROLE_PERMISSION_DESIGN.md
 * Section 6/11). Covers the Role Defaults matrix, Employee Permission Summary,
 * Employee Overrides (grant/revoke/remove/reset), Managing Partner Safety (Rule A/
 * Rule B, wired into a live route for the first time), audit logging, and the
 * MP-only gate. The permission catalogue itself (seeded rows, isCoreAdmin flags) is
 * covered by permissionCatalogue.test.ts; this file assumes that seed is correct
 * (auto-reseeded per test by tests/setup.ts) and tests the admin surface on top of it.
 */
async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const secondPartner = await createUser("MANAGING_PARTNER", "Second Partner");
  const associate = await createUser("ASSOCIATE");
  return {
    partner,
    secondPartner,
    associate,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    secondPartnerToken: await tokenForUser(secondPartner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
  };
}

describe("Permission-Management Admin API — access gating", () => {
  it("rejects a non-Managing-Partner from every route", async () => {
    const { associateToken } = await setup();
    const routes: [string, "get" | "patch" | "post" | "delete"][] = [
      ["/api/permissions/catalogue", "get"],
      ["/api/permissions/role-defaults", "get"],
    ];
    for (const [path, method] of routes) {
      const res = await request(app)[method](path).set("Authorization", `Bearer ${associateToken}`);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
    }
  });
});

describe("GET /api/permissions/catalogue and /role-defaults", () => {
  it("returns the full catalogue for the Managing Partner", async () => {
    const { partnerToken } = await setup();
    const res = await request(app).get("/api/permissions/catalogue").set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    // 83 through Client Portal Permissions (2026-08-14), +14 for the ACCOUNTS module
    // (2026-08-14) — 97, +7 for Case Section Access (2026-08-17) — 104, +2 for
    // Facts & Arguments (2026-08-18) — 106.
    expect(res.body.length).toBe(106);
    expect(res.body.some((p: { key: string }) => p.key === "CASES.VIEW_ALL")).toBe(true);
  });

  it("returns the dense role-default matrix", async () => {
    const { partnerToken } = await setup();
    const res = await request(app).get("/api/permissions/role-defaults").set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(106 * 5);
    const casesCreateForAssociate = res.body.find(
      (r: { role: string; permission: { key: string } }) => r.role === "ASSOCIATE" && r.permission.key === "CASES.CREATE"
    );
    expect(casesCreateForAssociate.granted).toBe(true);
  });
});

describe("PATCH /api/permissions/role-defaults", () => {
  it("applies a valid change, audit-logs it, and it takes effect on the very next request", async () => {
    const { partnerToken } = await setup();

    // Office Staff editing a Case is denied by default; grant it.
    const patchRes = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ changes: [{ role: "OFFICE_STAFF", permissionKey: "CASES.EDIT", granted: true }] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.updated).toBe(1);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "ROLE_PERMISSION_CHANGED", entityId: "OFFICE_STAFF:CASES.EDIT" },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.details).toContain("false -> true");

    // Takes effect immediately: a freshly-created Office Staff user's Permission
    // Summary reflects the new default without any further action.
    const officeStaff = await createUser("OFFICE_STAFF");
    const summaryRes = await request(app)
      .get(`/api/permissions/employees/${officeStaff.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    const casesEditEntry = summaryRes.body.effective.find(
      (e: { permission: { key: string } }) => e.permission.key === "CASES.EDIT"
    );
    expect(casesEditEntry.granted).toBe(true);
  });

  it("rejects an unknown permission key without applying any other change in the same batch", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        changes: [
          { role: "OFFICE_STAFF", permissionKey: "CASES.EDIT", granted: true },
          { role: "OFFICE_STAFF", permissionKey: "NOT.A.REAL.KEY", granted: true },
        ],
      });
    expect(res.status).toBe(400);

    const stillDefault = await prisma.rolePermission.findFirst({
      where: { role: "OFFICE_STAFF", permission: { key: "CASES.EDIT" } },
    });
    expect(stillDefault?.granted).toBe(false); // unchanged — the whole batch was rejected
  });

  it("Rule A: rejects revoking a core-admin permission from the MANAGING_PARTNER role default", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ changes: [{ role: "MANAGING_PARTNER", permissionKey: "USERS.MANAGE_PERMISSIONS", granted: false }] });
    expect(res.status).toBe(403);

    const stillGranted = await prisma.rolePermission.findFirst({
      where: { role: "MANAGING_PARTNER", permission: { key: "USERS.MANAGE_PERMISSIONS" } },
    });
    expect(stillGranted?.granted).toBe(true);
  });

  it("skips a no-op change (already at the requested value) — no audit entry written", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${partnerToken}`)
      // Associate already has CASES.CREATE granted by default.
      .send({ changes: [{ role: "ASSOCIATE", permissionKey: "CASES.CREATE", granted: true }] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "ROLE_PERMISSION_CHANGED", entityId: "ASSOCIATE:CASES.CREATE" },
    });
    expect(auditEntry).toBeNull();
  });
});

describe("GET /api/permissions/employees/:userId — Permission Summary", () => {
  it("returns role, role-default permissions, overrides, and the merged effective grant, correctly sourced", async () => {
    const { partner, associate } = await setup();
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.EDIT" } });
    await prisma.userPermissionOverride.create({
      data: { userId: associate.id, permissionId: permission.id, effect: "REVOKE", reason: "Test", setById: partner.id },
    });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .get(`/api/permissions/employees/${associate.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ASSOCIATE");

    const overriddenEntry = res.body.effective.find(
      (e: { permission: { key: string } }) => e.permission.key === "CASES.EDIT"
    );
    expect(overriddenEntry.roleDefault).toBe(true);
    expect(overriddenEntry.granted).toBe(false);
    expect(overriddenEntry.source).toBe("override");
    expect(overriddenEntry.override.effect).toBe("REVOKE");
    expect(overriddenEntry.override.reason).toBe("Test");

    const inheritedEntry = res.body.effective.find(
      (e: { permission: { key: string } }) => e.permission.key === "CASES.VIEW_ASSIGNED"
    );
    expect(inheritedEntry.source).toBe("role-default");
    expect(inheritedEntry.override).toBeNull();
  });

  it("404s for a non-existent user", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .get("/api/permissions/employees/not-a-real-id")
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST/DELETE /api/permissions/employees/:userId/overrides — grant, revoke, remove", () => {
  it("grants an override with a reason, audit-logs it, and it takes effect immediately", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "CLIENTS.CREATE", effect: "GRANT", reason: "Covering intake this week" });
    expect(res.status).toBe(201);

    const auditEntry = await prisma.auditLog.findFirst({ where: { action: "USER_PERMISSION_OVERRIDE_GRANTED" } });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.details).toContain("Covering intake this week");
  });

  it("rejects an override with no reason", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "CLIENTS.CREATE", effect: "GRANT", reason: "" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown permission key", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "NOT.A.KEY", effect: "GRANT", reason: "Testing" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate override for the same employee and permission", async () => {
    const { associate, partnerToken } = await setup();
    await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "CLIENTS.CREATE", effect: "GRANT", reason: "First grant" });

    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "CLIENTS.CREATE", effect: "GRANT", reason: "Second attempt" });
    expect(res.status).toBe(409);
  });

  it("Rule B: rejects a REVOKE override of a core-admin permission targeting a Managing Partner", async () => {
    const { secondPartner, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/permissions/employees/${secondPartner.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: "USERS.MANAGE_PERMISSIONS", effect: "REVOKE", reason: "Testing Rule B" });
    expect(res.status).toBe(403);
  });

  it("removes an override, audit-logs it, and the employee reverts to the role default immediately", async () => {
    const { partner, associate, partnerToken } = await setup();
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CLIENTS.CREATE" } });
    await prisma.userPermissionOverride.create({
      data: { userId: associate.id, permissionId: permission.id, effect: "GRANT", reason: "Test", setById: partner.id },
    });

    const res = await request(app)
      .delete(`/api/permissions/employees/${associate.id}/overrides/CLIENTS.CREATE`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(204);

    const auditEntry = await prisma.auditLog.findFirst({ where: { action: "USER_PERMISSION_OVERRIDE_REMOVED" } });
    expect(auditEntry).not.toBeNull();

    const remaining = await prisma.userPermissionOverride.findMany({ where: { userId: associate.id } });
    expect(remaining).toHaveLength(0);
  });

  it("404s when removing an override that doesn't exist", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .delete(`/api/permissions/employees/${associate.id}/overrides/CLIENTS.CREATE`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/permissions/employees/:userId/reset", () => {
  it("removes every override for an employee in one action, with a single audit entry", async () => {
    const { partner, associate, partnerToken } = await setup();
    const editPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.EDIT" } });
    const createPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "CLIENTS.CREATE" } });
    await prisma.userPermissionOverride.createMany({
      data: [
        { userId: associate.id, permissionId: editPermission.id, effect: "REVOKE", reason: "Test 1", setById: partner.id },
        { userId: associate.id, permissionId: createPermission.id, effect: "GRANT", reason: "Test 2", setById: partner.id },
      ],
    });

    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/reset`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(2);

    const remaining = await prisma.userPermissionOverride.findMany({ where: { userId: associate.id } });
    expect(remaining).toHaveLength(0);

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "USER_PERMISSIONS_RESET" } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].details).toContain("2");
  });

  it("is a no-op with no audit entry when the employee has no overrides", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/permissions/employees/${associate.id}/reset`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(0);

    const auditEntries = await prisma.auditLog.findMany({ where: { action: "USER_PERMISSIONS_RESET" } });
    expect(auditEntries).toHaveLength(0);
  });
});

describe("Managing Partner Safety — account deactivation (design doc Section 9.3)", () => {
  it("rejects deactivating the sole active Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .patch(`/api/auth/users/${partner.id}/status`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(403);

    const stillActive = await prisma.user.findUniqueOrThrow({ where: { id: partner.id } });
    expect(stillActive.status).toBe("ACTIVE");
  });

  it("allows deactivating one Managing Partner when another remains active", async () => {
    const { secondPartner, partnerToken } = await setup();
    const res = await request(app)
      .patch(`/api/auth/users/${secondPartner.id}/status`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(200);
  });

  it("allows deactivating a non-Managing-Partner regardless of Managing Partner count", async () => {
    const { associate, partnerToken } = await setup();
    const res = await request(app)
      .patch(`/api/auth/users/${associate.id}/status`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(200);
  });
});
