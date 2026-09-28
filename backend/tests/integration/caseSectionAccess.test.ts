import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, tokenForUser, tokenForClient } from "../helpers/fixtures";

/**
 * Case Section Access (2026-08-17; extended 2026-08-18 with Facts/Arguments —
 * see caseFactsArguments.test.ts for their section-specific coverage). Covers
 * spec §30's twenty scenarios: Managing Partner sees/keeps all ten sections;
 * each of the ten CASE_*.VIEW keys independently gates its own case-scoped
 * API; direct API access without the key returns 403; pre-existing case-level
 * authorization (assertCaseAccess) is still enforced on top of, never replaced
 * by, the new gate; the Client Portal and existing Accounts security are both
 * unaffected.
 */

const CASE_SECTION_KEYS = [
  "CASE_OVERVIEW.VIEW",
  "CASE_FACTS.VIEW",
  "CASE_ARGUMENTS.VIEW",
  "CASE_DOCUMENTS.VIEW",
  "CASE_TASKS.VIEW",
  "CASE_HEARINGS.VIEW",
  "CASE_TIMELINE.VIEW",
  "CASE_NOTES.VIEW",
  "CASE_BILLING_EXPENSES.VIEW",
  "CASE_ACCOUNTS.VIEW",
];

async function grantOverride(mpToken: string, userId: string, permissionKey: string, effect: "GRANT" | "REVOKE") {
  return request(app)
    .post(`/api/permissions/employees/${userId}/overrides`)
    .set("Authorization", `Bearer ${mpToken}`)
    .send({ permissionKey, effect, reason: "test" });
}

describe("Case Section Access — A. Catalogue and Managing Partner defaults", () => {
  it("all ten CASE_*.VIEW keys exist, are isCoreAdmin, and default true for Managing Partner", async () => {
    const permissions = await prisma.permission.findMany({ where: { key: { in: CASE_SECTION_KEYS } } });
    expect(permissions).toHaveLength(10);
    expect(permissions.every((p) => p.isCoreAdmin)).toBe(true);

    const mpGrants = await prisma.rolePermission.findMany({
      where: { role: "MANAGING_PARTNER", permissionId: { in: permissions.map((p) => p.id) } },
    });
    expect(mpGrants).toHaveLength(10);
    expect(mpGrants.every((g) => g.granted === true)).toBe(true);
  });

  it("GET /cases/section-permissions returns all ten flags true for the Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/cases/section-permissions").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      overview: true,
      facts: true,
      arguments: true,
      documents: true,
      tasks: true,
      hearings: true,
      timeline: true,
      notes: true,
      billingExpenses: true,
      accounts: true,
    });
  });

  it("a role-default REVOKE attempt on any of the ten keys for MANAGING_PARTNER is rejected", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    for (const key of CASE_SECTION_KEYS) {
      const res = await request(app)
        .patch("/api/permissions/role-defaults")
        .set("Authorization", `Bearer ${token}`)
        .send({ changes: [{ role: "MANAGING_PARTNER", permissionKey: key, granted: false }] });
      expect(res.status, `expected role-default revoke of ${key} to be rejected`).toBe(403);
    }
  });

  it("an individual override REVOKE on any of the ten keys targeting a Managing-Partner-role user is rejected", async () => {
    const partnerA = await createUser("MANAGING_PARTNER");
    const partnerB = await createUser("MANAGING_PARTNER");
    const tokenA = await tokenForUser(partnerA.id, "MANAGING_PARTNER");
    for (const key of CASE_SECTION_KEYS) {
      const res = await grantOverride(tokenA, partnerB.id, key, "REVOKE");
      expect(res.status, `expected override revoke of ${key} on an MP user to be rejected`).toBe(403);
    }
  });
});

describe("Case Section Access — B. Per-section enforcement", () => {
  it("Documents: user with CASE_DOCUMENTS.VIEW can list case documents; without it, 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const before = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(200);

    await grantOverride(partnerToken, associate.id, "CASE_DOCUMENTS.VIEW", "REVOKE");
    const after = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(after.status).toBe(403);
  });

  it("Tasks: user with CASE_TASKS.VIEW can list case tasks; without it, 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const before = await request(app).get(`/api/cases/${testCase.id}/tasks`).set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(200);

    await grantOverride(partnerToken, associate.id, "CASE_TASKS.VIEW", "REVOKE");
    const after = await request(app).get(`/api/cases/${testCase.id}/tasks`).set("Authorization", `Bearer ${associateToken}`);
    expect(after.status).toBe(403);
  });

  it("Hearings: user with CASE_HEARINGS.VIEW can list case hearings; without it, 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const before = await request(app)
      .get(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(200);

    await grantOverride(partnerToken, associate.id, "CASE_HEARINGS.VIEW", "REVOKE");
    const after = await request(app)
      .get(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(after.status).toBe(403);
  });

  it("Notes: user with CASE_NOTES.VIEW can list case notes; without it, 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const before = await request(app).get(`/api/cases/${testCase.id}/notes`).set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(200);

    await grantOverride(partnerToken, associate.id, "CASE_NOTES.VIEW", "REVOKE");
    const after = await request(app).get(`/api/cases/${testCase.id}/notes`).set("Authorization", `Bearer ${associateToken}`);
    expect(after.status).toBe(403);
  });

  it("Billing/Expenses: Office Staff (denied by default) gets 403 on case time-logs; Associate (granted by default) gets 200", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const officeToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const officeRes = await request(app)
      .get(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${officeToken}`);
    expect(officeRes.status).toBe(403);

    const associateRes = await request(app)
      .get(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(associateRes.status).toBe(200);
  });

  it("Accounts: user with CASE_ACCOUNTS.VIEW + ACCOUNTS.VIEW can reach the Case Accounts tab; with only one of the two, still 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });

    // Neither granted by default for ASSOCIATE.
    const neither = await request(app)
      .get(`/api/cases/${testCase.id}/accounts`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(neither.status).toBe(403);

    // Grant only CASE_ACCOUNTS.VIEW — still missing ACCOUNTS.VIEW.
    await grantOverride(partnerToken, associate.id, "CASE_ACCOUNTS.VIEW", "GRANT");
    const onlyCaseFlag = await request(app)
      .get(`/api/cases/${testCase.id}/accounts`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(onlyCaseFlag.status).toBe(403);

    // Grant ACCOUNTS.VIEW too — now both held, reachable.
    await grantOverride(partnerToken, associate.id, "ACCOUNTS.VIEW", "GRANT");
    const both = await request(app)
      .get(`/api/cases/${testCase.id}/accounts`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(both.status).toBe(200);
  });
});

describe("Case Section Access — C. Existing case-level authorization still applies", () => {
  it("holding CASE_DOCUMENTS.VIEW does not bypass case-level scoping — an unrelated Associate still gets 404", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const outsider = await createUser("ASSOCIATE");
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");

    // Outsider has CASE_DOCUMENTS.VIEW by role default but is not linked to this
    // case at all (not the partner, not an advocate) — assertCaseAccess must
    // still reject with 404 (case out of scope), never bypassed by the new gate.
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /cases/:id combined payload redacts documents/tasks/hearings/notes the actor's section flags deny, without denying the whole request", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    await grantOverride(partnerToken, associate.id, "CASE_DOCUMENTS.VIEW", "REVOKE");
    await grantOverride(partnerToken, associate.id, "CASE_NOTES.VIEW", "REVOKE");

    const res = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
    expect(res.body.notes).toEqual([]);
    // Tasks/hearings were never revoked — still present.
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(Array.isArray(res.body.hearings)).toBe(true);
  });

  it("hearings array is only stripped from GET /cases/:id when BOTH CASE_HEARINGS.VIEW and CASE_TIMELINE.VIEW are denied", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    await grantOverride(partnerToken, associate.id, "CASE_HEARINGS.VIEW", "REVOKE");
    const partial = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);
    // Timeline still granted — hearings array must still be present.
    expect(Array.isArray(partial.body.hearings)).toBe(true);

    await grantOverride(partnerToken, associate.id, "CASE_TIMELINE.VIEW", "REVOKE");
    const both = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(both.body.hearings).toEqual([]);
  });
});

describe("Case Section Access — D. Client Portal and Accounts security unaffected", () => {
  it("a CLIENT actor cannot reach any case-scoped section endpoint, regardless of Case Section Access", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const clientToken = await tokenForClient(client.id);

    const documents = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(documents.status).toBe(403);

    const notes = await request(app).get(`/api/cases/${testCase.id}/notes`).set("Authorization", `Bearer ${clientToken}`);
    expect(notes.status).toBe(403);
  });

  it("Client Portal document listing is unaffected by the new staff-only Case Section Access permissions", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    await prisma.client.update({ where: { id: client.id }, data: { portalDocumentsEnabled: true } });
    await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const clientToken = await tokenForClient(client.id);

    const res = await request(app).get("/api/client-portal/documents").set("Authorization", `Bearer ${clientToken}`);
    // Whatever this route's own pre-existing behavior is (200 with an empty/real
    // list), it must not be a 403 caused by the new staff-only permission system —
    // Client Portal routes never call requirePermission with a CASE_*.VIEW key.
    expect(res.status).toBe(200);
  });

  it("existing ACCOUNTS.* permission enforcement on /api/accounts/* (firm-wide, non-case) routes is untouched", async () => {
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });
});
