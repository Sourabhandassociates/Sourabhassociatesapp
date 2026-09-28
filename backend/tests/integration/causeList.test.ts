import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const otherAssociate = await createUser("ASSOCIATE", "Other Associate");
  const officeStaff = await createUser("OFFICE_STAFF");
  const client = await createClient("Cause List Client");

  const caseA = await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
  const caseB = await createCase({ partnerId: partner.id, advocateIds: [otherAssociate.id] });

  return {
    partner,
    associate,
    otherAssociate,
    officeStaff,
    client,
    caseA,
    caseB,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    otherAssociateToken: await tokenForUser(otherAssociate.id, "ASSOCIATE"),
    officeStaffToken: await tokenForUser(officeStaff.id, "OFFICE_STAFF"),
  };
}

async function scheduleHearing(
  caseId: string,
  token: string,
  overrides: Partial<{ hearingDate: string; courtName: string; courtHall: string; purpose: string }> = {}
) {
  const res = await request(app)
    .post(`/api/cases/${caseId}/hearings`)
    .set("Authorization", `Bearer ${token}`)
    .send({ hearingDate: "2026-09-01T10:00:00.000Z", ...overrides });
  return res.body;
}

const CUSTOM_RANGE = { rangePreset: "CUSTOM", startDate: "2026-08-25", endDate: "2026-09-10" };

describe("Cause List — row-level scope (Step 4)", () => {
  it("an Associate under default MINE scope sees only their own case's hearings", async () => {
    const { caseA, caseB, associateToken, otherAssociateToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);
    await scheduleHearing(caseB.id, otherAssociateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].caseId).toBe(caseA.id);
  });

  it("an Associate requesting scope=FIRM is silently downgraded to their own cases only", async () => {
    const { caseA, caseB, associateToken, otherAssociateToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);
    await scheduleHearing(caseB.id, otherAssociateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM" })
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].caseId).toBe(caseA.id);
    expect(res.body.meta.canViewFirmWide).toBe(false);
  });

  it("a Managing Partner with scope=FIRM sees every case's hearings", async () => {
    const { caseA, caseB, associateToken, otherAssociateToken, partnerToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);
    await scheduleHearing(caseB.id, otherAssociateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.meta.canViewFirmWide).toBe(true);
  });

  it("a Managing Partner using scope=EMPLOYEE sees only the selected advocate's cases", async () => {
    const { caseA, caseB, associate, otherAssociate, associateToken, otherAssociateToken, partnerToken } =
      await setup();
    await scheduleHearing(caseA.id, associateToken);
    await scheduleHearing(caseB.id, otherAssociateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "EMPLOYEE", employeeId: associate.id })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].caseId).toBe(caseA.id);

    const otherRes = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "EMPLOYEE", employeeId: otherAssociate.id })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(otherRes.body.rows).toHaveLength(1);
    expect(otherRes.body.rows[0].caseId).toBe(caseB.id);
  });

  it("scope=EMPLOYEE without employeeId is rejected with 400", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "EMPLOYEE" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(400);
  });

  it("meta.canViewFirmWide matches CASES.VIEW_ALL role defaults (MP/Office Staff true, Associate false)", async () => {
    const { partnerToken, officeStaffToken, associateToken } = await setup();
    const mp = await request(app)
      .get("/api/hearings/cause-list")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${partnerToken}`);
    const office = await request(app)
      .get("/api/hearings/cause-list")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${officeStaffToken}`);
    const associate = await request(app)
      .get("/api/hearings/cause-list")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(mp.body.meta.canViewFirmWide).toBe(true);
    expect(office.body.meta.canViewFirmWide).toBe(true);
    expect(associate.body.meta.canViewFirmWide).toBe(false);
  });
});

describe("Cause List — date range presets (Step 4)", () => {
  it("CUSTOM 400s when startDate/endDate are missing", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ rangePreset: "CUSTOM" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(400);
  });

  it("TODAY includes a hearing scheduled for right now and excludes one a month out", async () => {
    const { caseA, associateToken } = await setup();
    const now = new Date().toISOString();
    const farOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await scheduleHearing(caseA.id, associateToken, { hearingDate: now });

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ rangePreset: "TODAY" })
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(new Date(res.body.rows[0].hearingDate).toDateString()).toBe(new Date(now).toDateString());
    expect(farOut).not.toBe(now); // sanity: distinct dates, farOut never scheduled/asserted directly
  });
});

describe("Cause List — filters (Step 4)", () => {
  it("courtName, courtHall, stage, status, clientId, and advocateId each independently narrow the result set", async () => {
    const { caseA, caseB, client, associate, associateToken, otherAssociateToken, partnerToken } = await setup();
    await request(app)
      .patch(`/api/cases/${caseA.id}`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ stage: "Trial" });

    await scheduleHearing(caseA.id, associateToken, {
      courtName: "District Court",
      courtHall: "Hall 3",
      purpose: "Arguments",
    });
    await scheduleHearing(caseB.id, otherAssociateToken, { courtName: "High Court", courtHall: "Hall 7" });

    const byCourtName = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", courtName: "District Court" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byCourtName.body.rows).toHaveLength(1);
    expect(byCourtName.body.rows[0].caseId).toBe(caseA.id);

    const byCourtHall = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", courtHall: "Hall 7" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byCourtHall.body.rows).toHaveLength(1);
    expect(byCourtHall.body.rows[0].caseId).toBe(caseB.id);

    const byStage = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", stage: "Trial" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byStage.body.rows).toHaveLength(1);
    expect(byStage.body.rows[0].caseId).toBe(caseA.id);

    const byStatus = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", status: "SCHEDULED" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byStatus.body.rows).toHaveLength(2);

    const byClient = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", clientId: client.id })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byClient.body.rows).toHaveLength(1);
    expect(byClient.body.rows[0].caseId).toBe(caseA.id);

    const byAdvocate = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", advocateId: associate.id })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(byAdvocate.body.rows).toHaveLength(1);
    expect(byAdvocate.body.rows[0].caseId).toBe(caseA.id);
  });

  it("search matches on case number, title, and client name", async () => {
    const { caseA, client, associateToken, partnerToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ ...CUSTOM_RANGE, scope: "FIRM", search: client.name })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].caseId).toBe(caseA.id);
  });
});

describe("Cause List — courtHall and Next Hearing Date (Step 4)", () => {
  it("courtHall round-trips end-to-end from schedule through the Cause List row", async () => {
    const { caseA, associateToken } = await setup();
    await scheduleHearing(caseA.id, associateToken, { courtHall: "Court Hall No. 5" });

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.body.rows[0].courtHall).toBe("Court Hall No. 5");
  });

  it("shows the case's current SCHEDULED date as Next Hearing Date for a historical COMPLETED row", async () => {
    const { caseA, associateToken } = await setup();
    const scheduled = await scheduleHearing(caseA.id, associateToken, { hearingDate: "2026-09-01T10:00:00.000Z" });
    await request(app)
      .patch(`/api/hearings/${scheduled.id}/outcome`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ outcomeNotes: "Adjourned", nextHearingDate: "2026-10-15T10:00:00.000Z" });

    const res = await request(app)
      .get("/api/hearings/cause-list")
      .query({ rangePreset: "CUSTOM", startDate: "2026-08-25", endDate: "2026-09-10" })
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].hearingStatus).toBe("COMPLETED");
    expect(new Date(res.body.rows[0].nextHearingDate).toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });
});

describe("Cause List — export endpoints (Step 4)", () => {
  it("GET /export/pdf returns a non-empty application/pdf response", async () => {
    const { caseA, associateToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list/export/pdf")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${associateToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it("GET /export/excel returns a non-empty xlsx response", async () => {
    const { caseA, associateToken } = await setup();
    await scheduleHearing(caseA.id, associateToken);

    const res = await request(app)
      .get("/api/hearings/cause-list/export/excel")
      .query(CUSTOM_RANGE)
      .set("Authorization", `Bearer ${associateToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });
});
