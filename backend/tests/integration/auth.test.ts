import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, tokenForUser, tokenForClient } from "../helpers/fixtures";
import { prisma } from "../../src/config/prisma";

describe("POST /api/auth/login/staff", () => {
  it("rejects a wrong password", async () => {
    const partner = await createUser("MANAGING_PARTNER", "Real Partner");
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: partner.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("accepts correct credentials and returns a token", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    // password set by createUser's hashPassword("Test1234!") — verify the real login path end-to-end
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: partner.email, password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects a disabled account", async () => {
    const { prisma } = await import("../../src/config/prisma");
    const user = await createUser("ASSOCIATE");
    await prisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: user.email, password: "Test1234!" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/login/client", () => {
  it("rejects a wrong password", async () => {
    const client = await createClient();
    const res = await request(app)
      .post("/api/auth/login/client")
      .send({ clientId: client.clientId, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("accepts correct Client ID + password", async () => {
    const client = await createClient();
    const res = await request(app)
      .post("/api/auth/login/client")
      .send({ clientId: client.clientId, password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe("GET /api/auth/staff-directory", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/auth/staff-directory");
    expect(res.status).toBe(401);
  });

  it("rejects a client actor", async () => {
    const client = await createClient();
    const token = await tokenForClient(client.id);
    const res = await request(app).get("/api/auth/staff-directory").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows any staff role", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app).get("/api/auth/staff-directory").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("Managing-Partner-only endpoints", () => {
  it("POST /api/auth/users rejects a non-Partner", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Hire", email: "new.hire@test.local", password: "Test1234!", role: "OFFICE_STAFF" });
    expect(res.status).toBe(403);
  });

  it("POST /api/auth/users allows a Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).post("/api/auth/users").set("Authorization", `Bearer ${token}`).send({
      name: "New Hire",
      email: "new.hire@test.local",
      password: "Str0ng!Passw0rd",
      role: "OFFICE_STAFF",
    });
    expect(res.status).toBe(201);
  });

  it("POST /api/auth/users rejects a password that fails the strength policy", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Hire", email: "weak.pw@test.local", password: "short1!", role: "OFFICE_STAFF" });
    expect(res.status).toBe(400);
  });

  it("GET /api/auth/users rejects a non-Partner", async () => {
    const accounts = await createUser("ACCOUNTS_TEAM");
    const token = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");
    const res = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("PATCH /api/auth/users/:userId/status rejects a non-Partner", async () => {
    const officeStaff = await createUser("OFFICE_STAFF");
    const target = await createUser("ASSOCIATE");
    const token = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const res = await request(app)
      .patch(`/api/auth/users/${target.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(403);
  });

  it("POST /api/auth/sessions/:userId/force-logout rejects a non-Partner", async () => {
    const associate = await createUser("ASSOCIATE");
    const target = await createUser("JUNIOR_ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post(`/api/auth/sessions/${target.id}/force-logout`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("force-logout by a Partner actually revokes the target's sessions", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const target = await createUser("ASSOCIATE");
    const targetToken = await tokenForUser(target.id, "ASSOCIATE"); // creates an active UserSession row

    const forceLogout = await request(app)
      .post(`/api/auth/sessions/${target.id}/force-logout`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(forceLogout.status).toBe(204);

    const { prisma } = await import("../../src/config/prisma");
    const sessions = await prisma.userSession.findMany({ where: { userId: target.id } });
    expect(sessions.every((s) => s.status === "REVOKED")).toBe(true);
    void targetToken; // token itself remains a valid signature until its 15m expiry — the session row backing refresh is what matters here
  });
});

describe("Firm-wide audit trail expansion (2026-08-13) — auth security events", () => {
  it("a successful staff login records AUTH_LOGIN_SUCCESS with the actor's role and sessionId", async () => {
    const partner = await createUser("MANAGING_PARTNER", "Login Success Partner");
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: partner.email, password: "Test1234!" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: partner.id, action: "AUTH_LOGIN_SUCCESS" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userRole).toBe("MANAGING_PARTNER");
    expect(entry?.sessionId).toBeTruthy();
  });

  it("a failed staff login (wrong password) records AUTH_LOGIN_FAILURE", async () => {
    const partner = await createUser("MANAGING_PARTNER", "Login Failure Partner");
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: partner.email, password: "wrong-password" });
    expect(res.status).toBe(401);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: partner.id, action: "AUTH_LOGIN_FAILURE" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.details).toBe("wrong-password");
  });

  it("POST /api/auth/users records USER_CREATED attributed to the creating Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).post("/api/auth/users").set("Authorization", `Bearer ${token}`).send({
      name: "Audited New Hire",
      email: "audited.new.hire@test.local",
      password: "Str0ng!Passw0rd",
      role: "OFFICE_STAFF",
    });
    expect(res.status).toBe(201);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: res.body.id, action: "USER_CREATED" },
    });
    expect(entry?.userId).toBe(partner.id);
    expect(entry?.entityName).toBe("Audited New Hire");
  });

  it("PATCH /api/auth/users/:userId/status records USER_STATUS_CHANGED with the old/new status", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const target = await createUser("ASSOCIATE");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .patch(`/api/auth/users/${target.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: target.id, action: "USER_STATUS_CHANGED" },
    });
    expect(entry?.changes).toEqual({ status: { old: "ACTIVE", new: "INACTIVE" } });
  });

  it("force-logout records AUTH_FORCE_LOGOUT attributed to the acting Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const target = await createUser("ASSOCIATE");
    await tokenForUser(target.id, "ASSOCIATE");

    const res = await request(app)
      .post(`/api/auth/sessions/${target.id}/force-logout`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(204);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: target.id, action: "AUTH_FORCE_LOGOUT" },
    });
    expect(entry?.userId).toBe(partner.id);
  });
});
