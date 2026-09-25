import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, tokenForUser, tokenForClient } from "../helpers/fixtures";
import { prisma } from "../../src/config/prisma";

async function setupCaseWithAssignedAssociate() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const client = await createClient();
  const testCase = await createCase({
    partnerId: partner.id,
    advocateIds: [associate.id],
    clientIds: [client.id],
  });

  return {
    partner,
    associate,
    outsider,
    client,
    case: testCase,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
  };
}

describe("POST /api/cases (create)", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/api/cases").send({});
    expect(res.status).toBe(401);
  });

  it("rejects a Junior Associate (not in the allowed role list)", async () => {
    const junior = await createUser("JUNIOR_ASSOCIATE");
    const token = await tokenForUser(junior.id, "JUNIOR_ASSOCIATE");
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        practiceArea: "x",
        partnerId: partner.id,
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(403);
  });

  it("rejects a bogus partnerId", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        practiceArea: "x",
        partnerId: "does-not-exist",
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(400);
  });

  it("rejects a partnerId that belongs to a non-Partner user", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        practiceArea: "x",
        partnerId: associate.id, // an Associate, not a Partner
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(400);
  });

  it("rejects an advocateId that belongs to a non-Advocate role", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const accounts = await createUser("ACCOUNTS_TEAM");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        practiceArea: "x",
        partnerId: partner.id,
        advocateIds: [accounts.id],
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(400);
  });

  it("rejects a bogus clientId", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        practiceArea: "x",
        partnerId: partner.id,
        clients: [{ clientId: "nope", partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(400);
  });

  it("succeeds with valid references and generates a Matter Number", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Valid Case",
        practiceArea: "Property",
        partnerId: partner.id,
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(201);
    expect(res.body.matterNumber).toMatch(/^SA-MAT-\d{4}-\d{4}$/);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

describe("New Case form simplification (2026-08-11) — five optional fields + mandatory Client/Role", () => {
  it("creates a case with every optional field blank, only Client and Client Role supplied", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ clients: [{ clientId: client.id, partyRole: "Plaintiff" }] });

    expect(res.status).toBe(201);
    expect(res.body.matterNumber).toMatch(/^SA-MAT-\d{4}-\d{4}$/);
    expect(res.body.title).toBeNull();
    expect(res.body.practiceArea).toBeNull();
    expect(res.body.courtCaseNumber).toBeNull();
    expect(res.body.courtName).toBeNull();
    expect(res.body.courtNumber).toBeNull();
  });

  it("creates a case with only some of the five optional fields filled", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Only Title And Court No. Filled",
        courtNumber: "Court No. 4",
        clients: [{ clientId: client.id, partyRole: "Defendant" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Only Title And Court No. Filled");
    expect(res.body.courtNumber).toBe("Court No. 4");
    expect(res.body.practiceArea).toBeNull();
    expect(res.body.courtCaseNumber).toBeNull();
    expect(res.body.courtName).toBeNull();
  });

  it("a blank/whitespace-only title or practiceArea is normalized to null, not an empty string", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "   ", practiceArea: "", clients: [{ clientId: client.id, partyRole: "Plaintiff" }] });

    expect(res.status).toBe(201);
    expect(res.body.title).toBeNull();
    expect(res.body.practiceArea).toBeNull();
  });

  it("still requires at least one client — the one business rule explicitly carried forward as-is", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).post("/api/cases").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it("auto-assigns the case to a Managing Partner creator themself when partnerId is omitted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ clients: [{ clientId: client.id, partyRole: "Plaintiff" }] });

    expect(res.status).toBe(201);
    expect(res.body.partner.id).toBe(partner.id);
  });

  it("auto-assigns the case to the firm's active Managing Partner when an Associate creates it with partnerId omitted", async () => {
    const earlierPartner = await createUser("MANAGING_PARTNER", "Earlier Partner");
    await createUser("MANAGING_PARTNER", "Later Partner"); // created after, should not be picked
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ clients: [{ clientId: client.id, partyRole: "Plaintiff" }] });

    expect(res.status).toBe(201);
    expect(res.body.partner.id).toBe(earlierPartner.id);
  });

  it("an explicitly-supplied partnerId is still honored and still validated (bulk import / future admin flows)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const otherPartner = await createUser("MANAGING_PARTNER", "Other Partner");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({ partnerId: otherPartner.id, clients: [{ clientId: client.id, partyRole: "Plaintiff" }] });

    expect(res.status).toBe(201);
    expect(res.body.partner.id).toBe(otherPartner.id);
  });
});

describe("Row-level access to an existing case", () => {
  it("GET /api/cases/:id — 404s for an Associate not assigned to the case", async () => {
    const { case: testCase, outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/cases/:id — succeeds for the assigned Associate", async () => {
    const { case: testCase, associateToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("GET /api/cases/:id — succeeds for the Managing Partner regardless of assignment", async () => {
    const { case: testCase, partnerToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /api/cases — list excludes cases the actor has no relationship to", async () => {
    const { outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app).get("/api/cases").set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("PATCH /api/cases/:id — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ title: "hacked" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/cases/:id/status — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/status`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ status: "CLOSED" });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:id/advocates — 404s for an unrelated Associate (regression: previously unchecked)", async () => {
    const { case: testCase, outsider, outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/advocates`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ userId: outsider.id });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:id/advocates — rejects a non-advocate-role userId even for an authorized actor", async () => {
    const { case: testCase, partnerToken } = await setupCaseWithAssignedAssociate();
    const accounts = await createUser("ACCOUNTS_TEAM");
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/advocates`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ userId: accounts.id });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/cases/:id/advocates/:userId — 404s for an unrelated Associate (regression: previously unchecked)", async () => {
    const { case: testCase, associate, outsiderToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .delete(`/api/cases/${testCase.id}/advocates/${associate.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("a Client actor is blocked from every case endpoint", async () => {
    const { case: testCase, client } = await setupCaseWithAssignedAssociate();
    const token = await tokenForClient(client.id);
    const res = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("Case Overview fields (Step 1 revision, items 4/5/8: stage, description, type, opposite party/counsel, department)", () => {
  it("PATCH /api/cases/:id — updates and persists the new fields", async () => {
    const { case: testCase, partnerToken } = await setupCaseWithAssignedAssociate();
    const res = await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        stage: "Under Trial",
        description: "Property dispute, initial hearing completed.",
        caseType: "Civil",
        oppositeCounsel: "Adv. Rao",
        oppositeParty: "John Doe",
        department: "Litigation",
      });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("Under Trial");
    expect(res.body.description).toBe("Property dispute, initial hearing completed.");
    expect(res.body.caseType).toBe("Civil");
    expect(res.body.oppositeCounsel).toBe("Adv. Rao");
    expect(res.body.oppositeParty).toBe("John Doe");
    expect(res.body.department).toBe("Litigation");

    const fetched = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(fetched.body.stage).toBe("Under Trial");
  });
});

describe("Firm-wide audit trail expansion (2026-08-13) — Case coverage gaps", () => {
  it("CASE_CREATED is logged at creation", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();

    const res = await request(app)
      .post("/api/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        courtCaseNumber: "CC/1/2026",
        advocateIds: [],
        clients: [{ clientId: client.id, partyRole: "Plaintiff" }],
      });
    expect(res.status).toBe(201);

    const entry = await prisma.auditLog.findFirst({ where: { entityType: "Case", entityId: res.body.id, action: "CASE_CREATED" } });
    expect(entry).not.toBeNull();
    expect(entry?.entityName).toBe(res.body.matterNumber);
  });

  it("CASE_STATUS_CHANGED carries the old/new status in `changes`", async () => {
    const { partner, partnerToken, case: testCase } = await setupCaseWithAssignedAssociate();

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/status`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ status: "CLOSED" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_STATUS_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry?.userId).toBe(partner.id);
    expect(entry?.changes).toEqual({ status: { old: "INTAKE", new: "CLOSED" } });
  });

  it("CASE_ADVOCATE_ADDED / CASE_ADVOCATE_REMOVED are logged with the advocate's name", async () => {
    const { partnerToken, case: testCase } = await setupCaseWithAssignedAssociate();
    const newAdvocate = await createUser("ASSOCIATE", "Newly Added Advocate");

    const add = await request(app)
      .post(`/api/cases/${testCase.id}/advocates`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ userId: newAdvocate.id });
    expect(add.status).toBe(201);

    const addedEntry = await prisma.auditLog.findFirst({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_ADVOCATE_ADDED" },
    });
    expect(addedEntry?.details).toBe("Newly Added Advocate");

    const remove = await request(app)
      .delete(`/api/cases/${testCase.id}/advocates/${newAdvocate.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(remove.status).toBe(204);

    const removedEntry = await prisma.auditLog.findFirst({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_ADVOCATE_REMOVED" },
    });
    expect(removedEntry?.details).toBe("Newly Added Advocate");
  });
});
