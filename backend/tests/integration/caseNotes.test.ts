import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const junior = await createUser("JUNIOR_ASSOCIATE", "Assigned Junior");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const officeStaff = await createUser("OFFICE_STAFF");
  const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id, junior.id] });

  return {
    case: testCase,
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    juniorToken: await tokenForUser(junior.id, "JUNIOR_ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
    officeStaffToken: await tokenForUser(officeStaff.id, "OFFICE_STAFF"),
  };
}

describe("Case Notes / Diary (SRD Section 7 — chronological, author + timestamp)", () => {
  it("POST /api/cases/:caseId/notes — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ content: "Sneaky note" });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:caseId/notes — Office Staff (not an advocate) cannot add a diary entry", async () => {
    const { case: testCase, officeStaffToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ content: "Should be rejected" });
    expect(res.status).toBe(403);
  });

  it("POST /api/cases/:caseId/notes — an assigned Junior Associate can add a note", async () => {
    const { case: testCase, juniorToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ content: "Attended hearing, adjourned to next month." });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Attended hearing, adjourned to next month.");
    expect(res.body.author.id).toBeDefined();
  });

  it("GET /api/cases/:caseId/notes — returns notes in chronological order with author attribution", async () => {
    const { case: testCase, associateToken, juniorToken } = await setup();
    await request(app)
      .post(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ content: "First entry" });
    await request(app)
      .post(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ content: "Second entry" });

    const res = await request(app)
      .get(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].content).toBe("First entry");
    expect(res.body[1].content).toBe("Second entry");
  });

  it("GET /api/cases/:caseId/notes — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/notes`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});
