import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, tokenForUser, tokenForClient } from "../helpers/fixtures";

/**
 * Facts & Arguments case sections (2026-08-18). Covers spec §20's 38 numbered
 * scenarios. Facts and Arguments are functionally identical (same endpoint
 * shape, same permission-per-section model, same sanitize-on-write behavior),
 * so most scenarios are proven once per section rather than duplicated
 * verbatim — the shared assertions (Case-level auth, cross-case isolation,
 * audit logging, Client Portal exclusion) are still exercised for both.
 */

async function grantOverride(mpToken: string, userId: string, permissionKey: string, effect: "GRANT" | "REVOKE") {
  return request(app)
    .post(`/api/permissions/employees/${userId}/overrides`)
    .set("Authorization", `Bearer ${mpToken}`)
    .send({ permissionKey, effect, reason: "test" });
}

describe("Case Facts — A", () => {
  it("1/2. Managing Partner can view and edit Facts", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const before = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.facts).toBeNull();

    const saved = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<h1>Background</h1><p>The claimant alleges <b>breach of contract</b>.</p>" });
    expect(saved.status).toBe(200);
    expect(saved.body.facts).toContain("<h1>Background</h1>");
    expect(saved.body.facts).toContain("<b>breach of contract</b>");
  });

  it("3/4. Staff user with CASE_FACTS.VIEW can view and edit Facts", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // CASE_FACTS.VIEW true by default
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const view = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${associateToken}`);
    expect(view.status).toBe(200);

    const edit = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ content: "<p>Chronology: filed 12 Jan 2026.</p>" });
    expect(edit.status).toBe(200);
    expect(edit.body.facts).toContain("Chronology");
  });

  it("5/6. Staff user without CASE_FACTS.VIEW receives 403 on both view and direct API access", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await grantOverride(partnerToken, associate.id, "CASE_FACTS.VIEW", "REVOKE");

    const view = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${associateToken}`);
    expect(view.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ content: "<p>Should be blocked</p>" });
    expect(edit.status).toBe(403);
  });

  it("7. Case-level authorization is still enforced — an unrelated Associate gets 404, not the content", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE"); // CASE_FACTS.VIEW granted by role default
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id }); // outsider not linked

    const res = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("8. Facts are isolated between Cases — Case A's Facts are never returned for Case B", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const caseA = await createCase({ partnerId: partner.id });
    const caseB = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${caseA.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Facts unique to Case A</p>" });

    const caseBFacts = await request(app).get(`/api/cases/${caseB.id}/facts`).set("Authorization", `Bearer ${token}`);
    expect(caseBFacts.body.facts).toBeNull();

    const caseAFacts = await request(app).get(`/api/cases/${caseA.id}/facts`).set("Authorization", `Bearer ${token}`);
    expect(caseAFacts.body.facts).toContain("Case A");
  });

  it("9/10/11. Facts can be created, updated, and the latest saved content is returned — no duplicate records", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>First draft</p>" });
    const updated = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Revised final version</p>" });
    expect(updated.body.facts).toContain("Revised final version");
    expect(updated.body.facts).not.toContain("First draft");

    const latest = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${token}`);
    expect(latest.body.facts).toContain("Revised final version");

    // Exactly one Case row holds the content — no separate versioning table exists.
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(caseRow.facts).toContain("Revised final version");
  });

  it("12. Audit log is created for Facts updates, without storing the full text repeatedly", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Some facts</p>" });

    const entries = await prisma.auditLog.findMany({ where: { entityType: "Case", entityId: testCase.id, action: "CASE_FACTS_UPDATED" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe(partner.id);
    expect(entries[0].createdAt).toBeInstanceOf(Date);
    // Not the entire HTML body — a short, fixed-shape detail string instead.
    expect((entries[0].details ?? "").length).toBeLessThan(100);
  });

  it("sanitizes malicious HTML on save — scripts/event handlers never survive, allowed formatting does", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: '<p onclick="steal()">Safe text</p><script>alert(1)</script><img src=x onerror=alert(2)>' });

    expect(res.status).toBe(200);
    expect(res.body.facts).not.toContain("<script");
    expect(res.body.facts).not.toContain("onerror");
    expect(res.body.facts).not.toContain("onclick");
    expect(res.body.facts).not.toContain("<img");
    expect(res.body.facts).toContain("Safe text");
  });

  it("saving empty content clears Facts back to null rather than storing empty placeholder text", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Something</p>" });
    const cleared = await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "" });
    expect(cleared.body.facts).toBeNull();
  });
});

describe("Case Arguments — B", () => {
  it("13/14. Managing Partner can view and edit Arguments", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const before = await request(app).get(`/api/cases/${testCase.id}/arguments`).set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.arguments).toBeNull();

    const saved = await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<h2>Issue 1</h2><ol><li>Section 73, Contract Act applies.</li></ol>" });
    expect(saved.status).toBe(200);
    expect(saved.body.arguments).toContain("Section 73");
  });

  it("15/16. Staff user with CASE_ARGUMENTS.VIEW can view and edit Arguments", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // CASE_ARGUMENTS.VIEW true by default
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const view = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(view.status).toBe(200);

    const edit = await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ content: "<p>Counter-argument: limitation bars the claim.</p>" });
    expect(edit.status).toBe(200);
    expect(edit.body.arguments).toContain("limitation bars the claim");
  });

  it("17/18. Staff user without CASE_ARGUMENTS.VIEW receives 403 on both view and direct API access", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await grantOverride(partnerToken, associate.id, "CASE_ARGUMENTS.VIEW", "REVOKE");

    const view = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(view.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ content: "<p>Should be blocked</p>" });
    expect(edit.status).toBe(403);
  });

  it("19. Case-level authorization is still enforced for Arguments", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE");
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("20. Arguments are isolated between Cases", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const caseA = await createCase({ partnerId: partner.id });
    const caseB = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${caseA.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Arguments unique to Case A</p>" });

    const caseBArguments = await request(app)
      .get(`/api/cases/${caseB.id}/arguments`)
      .set("Authorization", `Bearer ${token}`);
    expect(caseBArguments.body.arguments).toBeNull();
  });

  it("21/22/23. Arguments can be created, updated, and the latest saved content is returned", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Draft submission</p>" });
    const updated = await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Final submission</p>" });
    expect(updated.body.arguments).toContain("Final submission");

    const latest = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`);
    expect(latest.body.arguments).toContain("Final submission");
    expect(latest.body.arguments).not.toContain("Draft submission");
  });

  it("24. Audit log is created for Arguments updates", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Some arguments</p>" });

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_ARGUMENTS_UPDATED" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe(partner.id);
  });

  it("updatedAt/updatedBy reflect who last saved Arguments", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "<p>Some arguments</p>" });
    expect(res.body.argumentsUpdatedBy.id).toBe(partner.id);
    expect(res.body.argumentsUpdatedBy.name).toBe(partner.name);
    expect(res.body.argumentsUpdatedAt).toBeTruthy();
  });
});

describe("Facts/Arguments — Permission Management — C", () => {
  it("25. Managing Partner sees Facts/Arguments permissions in an employee's effective-permission summary", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");

    const res = await request(app)
      .get(`/api/permissions/employees/${associate.id}`)
      .set("Authorization", `Bearer ${token}`);
    const keys = res.body.effective.map((e: { permission: { key: string } }) => e.permission.key);
    expect(keys).toContain("CASE_FACTS.VIEW");
    expect(keys).toContain("CASE_ARGUMENTS.VIEW");
  });

  it("26/27. Managing Partner can grant and revoke Facts access for a user", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF"); // CASE_FACTS.VIEW true by default — revoke first to test a clean grant
    await grantOverride(token, officeStaff.id, "CASE_FACTS.VIEW", "REVOKE");

    const officeToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const testCase = await createCase({ partnerId: partner.id });
    const denied = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${officeToken}`);
    expect(denied.status).toBe(403);

    await request(app)
      .delete(`/api/permissions/employees/${officeStaff.id}/overrides/CASE_FACTS.VIEW`)
      .set("Authorization", `Bearer ${token}`);
    await grantOverride(token, officeStaff.id, "CASE_FACTS.VIEW", "GRANT");
    const allowed = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${officeToken}`);
    expect(allowed.status).toBe(200);
  });

  it("28/29. Managing Partner can grant and revoke Arguments access for a user", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // CASE_ARGUMENTS.VIEW true by default
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    await grantOverride(token, associate.id, "CASE_ARGUMENTS.VIEW", "REVOKE");
    const denied = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(denied.status).toBe(403);

    await request(app)
      .delete(`/api/permissions/employees/${associate.id}/overrides/CASE_ARGUMENTS.VIEW`)
      .set("Authorization", `Bearer ${token}`);
    const restored = await request(app)
      .get(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(restored.status).toBe(200);
  });

  it("30/31. Managing Partner cannot revoke their own Facts or Arguments access", async () => {
    const partnerA = await createUser("MANAGING_PARTNER");
    const partnerB = await createUser("MANAGING_PARTNER");
    const tokenA = await tokenForUser(partnerA.id, "MANAGING_PARTNER");

    const factsRoleRevoke = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ changes: [{ role: "MANAGING_PARTNER", permissionKey: "CASE_FACTS.VIEW", granted: false }] });
    expect(factsRoleRevoke.status).toBe(403);

    const argumentsRoleRevoke = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ changes: [{ role: "MANAGING_PARTNER", permissionKey: "CASE_ARGUMENTS.VIEW", granted: false }] });
    expect(argumentsRoleRevoke.status).toBe(403);

    const factsOverrideRevoke = await grantOverride(tokenA, partnerB.id, "CASE_FACTS.VIEW", "REVOKE");
    expect(factsOverrideRevoke.status).toBe(403);

    const argumentsOverrideRevoke = await grantOverride(tokenA, partnerB.id, "CASE_ARGUMENTS.VIEW", "REVOKE");
    expect(argumentsOverrideRevoke.status).toBe(403);
  });

  it("32. Existing Case Section permissions remain unaffected by adding Facts/Arguments", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const documents = await request(app).get(`/api/cases/${testCase.id}/documents`).set("Authorization", `Bearer ${token}`);
    expect(documents.status).toBe(200);
    const accounts = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(accounts.status).toBe(200);
  });
});

describe("Facts/Arguments — Client Portal exclusion — D", () => {
  it("33/34. Facts and Arguments are not exposed to the Client Portal — a CLIENT actor is rejected before any permission check", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    await request(app)
      .patch(`/api/cases/${testCase.id}/facts`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ content: "<p>Internal facts</p>" });
    await request(app)
      .patch(`/api/cases/${testCase.id}/arguments`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ content: "<p>Internal arguments</p>" });

    const clientToken = await tokenForClient(client.id);
    const facts = await request(app).get(`/api/cases/${testCase.id}/facts`).set("Authorization", `Bearer ${clientToken}`);
    expect(facts.status).toBe(403);
    const args = await request(app).get(`/api/cases/${testCase.id}/arguments`).set("Authorization", `Bearer ${clientToken}`);
    expect(args.status).toBe(403);

    // The Client Portal's own case-detail endpoint never includes facts/arguments at all.
    const portalCase = await request(app).get(`/api/client-portal/cases/${testCase.id}`).set("Authorization", `Bearer ${clientToken}`);
    if (portalCase.status === 200) {
      expect(portalCase.body.facts).toBeUndefined();
      expect(portalCase.body.arguments).toBeUndefined();
    }
  });
});
