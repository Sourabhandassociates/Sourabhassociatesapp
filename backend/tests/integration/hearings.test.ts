import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const junior = await createUser("JUNIOR_ASSOCIATE", "Assigned Junior");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id, junior.id] });

  return {
    case: testCase,
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    juniorToken: await tokenForUser(junior.id, "JUNIOR_ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
  };
}

describe("Hearing scheduling and calendar (SRD Section 15)", () => {
  it("POST /api/cases/:caseId/hearings — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:caseId/hearings — a Junior Associate (read-only on hearings) is rejected", async () => {
    const { case: testCase, juniorToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });
    expect(res.status).toBe(403);
  });

  it("POST /api/cases/:caseId/hearings — an assigned Associate can schedule a hearing", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z", courtName: "High Court" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
  });

  it("POST/PATCH /api/hearings — courtHall (Step 4) round-trips on schedule and reschedule", async () => {
    const { case: testCase, associateToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z", courtHall: "Hall 2" });
    expect(scheduled.body.courtHall).toBe("Hall 2");

    const rescheduled = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-10T10:00:00.000Z", courtHall: "Hall 9" });
    expect(rescheduled.body.courtHall).toBe("Hall 9");
  });

  it("GET /api/cases/:caseId/hearings — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("PATCH /api/hearings/:id/outcome — recording an outcome with a next date auto-creates the next SCHEDULED hearing", async () => {
    const { case: testCase, associateToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });

    const res = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}/outcome`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ outcomeNotes: "Adjourned", nextHearingDate: "2026-10-01T10:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.hearing.status).toBe("COMPLETED");
    expect(res.body.nextHearing).not.toBeNull();
    expect(res.body.nextHearing.status).toBe("SCHEDULED");
    expect(new Date(res.body.nextHearing.hearingDate).toISOString()).toBe("2026-10-01T10:00:00.000Z");

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(list.body).toHaveLength(2);
  });

  it("PATCH /api/hearings/:id/outcome — a Junior Associate cannot record an outcome", async () => {
    const { case: testCase, associateToken, juniorToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });

    const res = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}/outcome`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ outcomeNotes: "Adjourned" });
    expect(res.status).toBe(403);
  });

  it("GET /api/hearings?startDate=&endDate= — only returns hearings on cases the actor can access", async () => {
    const { case: testCase, associateToken, outsiderToken } = await setup();
    await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });

    const outsiderRes = await request(app)
      .get("/api/hearings")
      .query({ startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-10-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(outsiderRes.status).toBe(200);
    expect(outsiderRes.body).toHaveLength(0);

    const associateRes = await request(app)
      .get("/api/hearings")
      .query({ startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-10-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${associateToken}`);
    expect(associateRes.status).toBe(200);
    expect(associateRes.body).toHaveLength(1);
  });

  it("GET /api/hearings — 400s when startDate/endDate are missing", async () => {
    const { associateToken } = await setup();
    const res = await request(app).get("/api/hearings").set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Hearing workflow revision — single active hearing per case (Step 1 revision, item 6)", () => {
  it("POST /api/cases/:caseId/hearings — rejects scheduling a second hearing while one is already SCHEDULED", async () => {
    const { case: testCase, associateToken } = await setup();
    await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });

    const second = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-15T10:00:00.000Z" });
    expect(second.status).toBe(409);
  });

  it("PATCH /api/hearings/:id — reschedules the upcoming hearing in place, no second row created", async () => {
    const { case: testCase, associateToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z", courtName: "Trial Court" });

    const rescheduled = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-20T10:00:00.000Z", courtName: "Trial Court" });
    expect(rescheduled.status).toBe(200);
    expect(rescheduled.body.id).toBe(scheduled.body.id);
    expect(new Date(rescheduled.body.hearingDate).toISOString()).toBe("2026-09-20T10:00:00.000Z");

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].status).toBe("SCHEDULED");
  });

  it("PATCH /api/hearings/:id — cannot reschedule an already-COMPLETED hearing", async () => {
    const { case: testCase, associateToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });
    await request(app)
      .patch(`/api/hearings/${scheduled.body.id}/outcome`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ outcomeNotes: "Done" });

    const res = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-25T10:00:00.000Z" });
    expect(res.status).toBe(409);
  });

  it("PATCH /api/hearings/:id — a Junior Associate cannot reschedule", async () => {
    const { case: testCase, associateToken, juniorToken } = await setup();
    const scheduled = await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ hearingDate: "2026-09-01T10:00:00.000Z" });

    const res = await request(app)
      .patch(`/api/hearings/${scheduled.body.id}`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ hearingDate: "2026-09-25T10:00:00.000Z" });
    expect(res.status).toBe(403);
  });
});
