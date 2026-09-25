import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireAuth } from "../../src/middleware/auth";
import { requireStaff } from "../../src/middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../src/middleware/permissions";
import { errorHandler } from "../../src/middleware/errorHandler";
import { prisma } from "../../src/config/prisma";
import { seedPermissionCatalogue } from "../../src/modules/permissions/seedPermissions";
import { createUser, createClient, tokenForUser, tokenForClient } from "../helpers/fixtures";
import * as permissionEvaluator from "../../src/modules/permissions/permissionEvaluator";

/**
 * Step 3 M2 — an isolated Express app (same pattern as tests/unit/rateLimit.test.ts)
 * wiring requireAuth -> requireStaff -> attachEffectivePermissions ->
 * requirePermission exactly as the real routers will after cutover (M2's later
 * tasks), verified here against real JWTs and a real seeded database.
 */
function buildTestApp() {
  const app = express();
  app.get(
    "/probe",
    requireAuth,
    requireStaff,
    attachEffectivePermissions,
    requirePermission("CASES.CREATE"),
    (_req, res) => res.json({ ok: true })
  );
  app.use(errorHandler);
  return app;
}

describe("attachEffectivePermissions + requirePermission (Step 3 M2)", () => {
  it("allows a request when the role default grants the permission", async () => {
    await seedPermissionCatalogue();
    const associate = await createUser("ASSOCIATE"); // CASES.CREATE granted by default
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(buildTestApp()).get("/probe").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("blocks a request when the role default denies the permission", async () => {
    await seedPermissionCatalogue();
    const jrAssociate = await createUser("JUNIOR_ASSOCIATE"); // CASES.CREATE denied by default
    const token = await tokenForUser(jrAssociate.id, "JUNIOR_ASSOCIATE");

    const res = await request(buildTestApp()).get("/probe").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("a GRANT override allows a request the role default would otherwise block", async () => {
    await seedPermissionCatalogue();
    const partner = await createUser("MANAGING_PARTNER");
    const jrAssociate = await createUser("JUNIOR_ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.CREATE" } });
    await prisma.userPermissionOverride.create({
      data: { userId: jrAssociate.id, permissionId: permission.id, effect: "GRANT", reason: "Covering leave", setById: partner.id },
    });
    const token = await tokenForUser(jrAssociate.id, "JUNIOR_ASSOCIATE");

    const res = await request(buildTestApp()).get("/probe").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("a REVOKE override blocks a request the role default would otherwise allow", async () => {
    await seedPermissionCatalogue();
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "CASES.CREATE" } });
    await prisma.userPermissionOverride.create({
      data: { userId: associate.id, permissionId: permission.id, effect: "REVOKE", reason: "Suspended pending review", setById: partner.id },
    });
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(buildTestApp()).get("/probe").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("blocks a Client actor (requireStaff runs first, so a Client never reaches the permission check)", async () => {
    await seedPermissionCatalogue();
    const client = await createClient();
    const token = await tokenForClient(client.id);

    const res = await request(buildTestApp()).get("/probe").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(buildTestApp()).get("/probe");
    expect(res.status).toBe(401);
  });

  it("loads the effective permission set exactly once per request, even if the middleware is wired twice (no repeated DB lookups)", async () => {
    await seedPermissionCatalogue();
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const loadSpy = vi.spyOn(permissionEvaluator, "loadEffectivePermissions");

    const app = express();
    app.get(
      "/probe-multi",
      requireAuth,
      requireStaff,
      attachEffectivePermissions,
      requirePermission("CASES.CREATE"),
      attachEffectivePermissions, // wired a second time, deliberately, to prove memoization
      (_req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).get("/probe-multi").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    loadSpy.mockRestore();
  });
});
