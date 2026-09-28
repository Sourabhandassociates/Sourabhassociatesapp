import { describe, it, expect } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { app } from "../../src/app";
import { createUser, tokenForUser } from "../helpers/fixtures";
import { prisma } from "../../src/config/prisma";

async function enrollMfa(token: string) {
  const begin = await request(app).post("/api/auth/mfa/enroll/begin").set("Authorization", `Bearer ${token}`);
  const code = authenticator.generate(begin.body.secret);
  const confirm = await request(app)
    .post("/api/auth/mfa/enroll/confirm")
    .set("Authorization", `Bearer ${token}`)
    .send({ secret: begin.body.secret, code });
  return { secret: begin.body.secret, backupCodes: confirm.body.backupCodes as string[] };
}

describe("MFA (Milestone 4, SRD Section 28 — mandatory for Partner/Accounts)", () => {
  it("flags mfaSetupRequired on login for Managing Partner/Accounts Team but not other roles, before enrollment", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const accounts = await createUser("ACCOUNTS_TEAM");
    const associate = await createUser("ASSOCIATE");

    const partnerLogin = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    expect(partnerLogin.body.mfaSetupRequired).toBe(true);

    const accountsLogin = await request(app).post("/api/auth/login/staff").send({ email: accounts.email, password: "Test1234!" });
    expect(accountsLogin.body.mfaSetupRequired).toBe(true);

    const associateLogin = await request(app).post("/api/auth/login/staff").send({ email: associate.email, password: "Test1234!" });
    expect(associateLogin.body.mfaSetupRequired).toBe(false);
  });

  it("enrolls via begin+confirm, issuing 10 backup codes, and rejects confirm with a wrong code", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const begin = await request(app).post("/api/auth/mfa/enroll/begin").set("Authorization", `Bearer ${token}`);
    expect(begin.status).toBe(200);
    expect(begin.body.secret).toBeTruthy();
    expect(begin.body.qrCodeDataUrl).toMatch(/^data:image\//);

    const badConfirm = await request(app)
      .post("/api/auth/mfa/enroll/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ secret: begin.body.secret, code: "000000" });
    expect(badConfirm.status).toBe(401);

    const goodCode = authenticator.generate(begin.body.secret);
    const confirm = await request(app)
      .post("/api/auth/mfa/enroll/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ secret: begin.body.secret, code: goodCode });
    expect(confirm.status).toBe(200);
    expect(confirm.body.backupCodes).toHaveLength(10);
  });

  it("challenges an MFA-enabled user at login instead of issuing a session directly, then completes login with a valid TOTP code", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const { secret } = await enrollMfa(token);

    const login = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.mfaChallengeToken).toBeTruthy();
    expect(login.body.accessToken).toBeUndefined();

    const code = authenticator.generate(secret);
    const verify = await request(app)
      .post("/api/auth/login/mfa")
      .send({ mfaChallengeToken: login.body.mfaChallengeToken, code });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.mfaSetupRequired).toBe(false);
  });

  it("rejects an invalid MFA code at the login challenge step", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await enrollMfa(token);

    const login = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    const verify = await request(app)
      .post("/api/auth/login/mfa")
      .send({ mfaChallengeToken: login.body.mfaChallengeToken, code: "000000" });
    expect(verify.status).toBe(401);
  });

  it("accepts a backup code as a fallback at the login challenge step, and consumes it (single use)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const { backupCodes } = await enrollMfa(token);

    const login = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    const firstUse = await request(app)
      .post("/api/auth/login/mfa")
      .send({ mfaChallengeToken: login.body.mfaChallengeToken, code: backupCodes[0] });
    expect(firstUse.status).toBe(200);

    const login2 = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    const secondUse = await request(app)
      .post("/api/auth/login/mfa")
      .send({ mfaChallengeToken: login2.body.mfaChallengeToken, code: backupCodes[0] });
    expect(secondUse.status).toBe(401);
  });

  it("requires the current password to disable MFA, then login no longer challenges", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await enrollMfa(token);

    const wrongPassword = await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "wrong-password" });
    expect(wrongPassword.status).toBe(403);

    const disable = await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Test1234!" });
    expect(disable.status).toBe(204);

    const login = await request(app).post("/api/auth/login/staff").send({ email: partner.email, password: "Test1234!" });
    expect(login.body.mfaRequired).toBeUndefined();
    expect(login.body.accessToken).toBeTruthy();
  });
});

describe("Session management (Milestone 4, SRD Section 9.4)", () => {
  it("lets a user list and revoke their own session, but not someone else's", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const tokenA = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const tokenB = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const sessions = await request(app).get("/api/auth/sessions/me").set("Authorization", `Bearer ${tokenA}`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.length).toBeGreaterThanOrEqual(2);

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const associateSessions = await request(app).get("/api/auth/sessions/me").set("Authorization", `Bearer ${associateToken}`);
    const otherSessionId = associateSessions.body[0].id;

    const crossRevoke = await request(app)
      .post(`/api/auth/sessions/${otherSessionId}/revoke`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(crossRevoke.status).toBe(403);

    const ownSessionId = sessions.body[0].id;
    const ownRevoke = await request(app)
      .post(`/api/auth/sessions/${ownSessionId}/revoke`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(ownRevoke.status).toBe(204);
  });

  it("gates viewing another user's sessions behind SESSIONS.VIEW_ANY (Managing Partner only by default)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await tokenForUser(associate.id, "ASSOCIATE");

    const asPartner = await request(app)
      .get(`/api/auth/sessions/${associate.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(asPartner.status).toBe(200);
    expect(asPartner.body.length).toBeGreaterThanOrEqual(2);

    const asAssociate = await request(app)
      .get(`/api/auth/sessions/${partner.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(asAssociate.status).toBe(403);
  });
});

describe("Firm-wide audit trail expansion (2026-08-13) — MFA and session security events", () => {
  it("records AUTH_MFA_ENABLED on successful enrollment and AUTH_MFA_DISABLED on disable", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await enrollMfa(token);

    const enabledEntry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: partner.id, action: "AUTH_MFA_ENABLED" },
    });
    expect(enabledEntry).not.toBeNull();

    await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Test1234!" });

    const disabledEntry = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: partner.id, action: "AUTH_MFA_DISABLED" },
    });
    expect(disabledEntry).not.toBeNull();
  });

  it("records AUTH_LOGOUT for the acting user on /api/auth/logout", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Session", userId: associate.id, action: "AUTH_LOGOUT" },
    });
    expect(entry).not.toBeNull();
  });

  it("records AUTH_SESSION_REVOKED when a user revokes one of their own other sessions", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const tokenA = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await tokenForUser(partner.id, "MANAGING_PARTNER");

    const sessions = await request(app).get("/api/auth/sessions/me").set("Authorization", `Bearer ${tokenA}`);
    const sessionToRevoke = sessions.body[0].id;

    const revoke = await request(app)
      .post(`/api/auth/sessions/${sessionToRevoke}/revoke`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(revoke.status).toBe(204);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Session", entityId: sessionToRevoke, action: "AUTH_SESSION_REVOKED" },
    });
    expect(entry?.userId).toBe(partner.id);
  });
});
