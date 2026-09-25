import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createCase, createTask, createDocument, tokenForUser } from "../helpers/fixtures";

describe("Pagination headers (Milestone 4, IMPROVEMENTS.md #16)", () => {
  it("GET /api/cases — X-Total-Count/X-Page/X-Page-Size headers reflect the requested page, body stays a plain array", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createCase({ partnerId: partner.id });
    await createCase({ partnerId: partner.id });
    await createCase({ partnerId: partner.id });

    const res = await request(app).get("/api/cases?page=1&pageSize=2").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(Number(res.headers["x-total-count"])).toBeGreaterThanOrEqual(3);
    expect(res.headers["x-page"]).toBe("1");
    expect(res.headers["x-page-size"]).toBe("2");
  });

  it("GET /api/clients — pagination headers present and body is a plain array", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/clients?page=1&pageSize=5").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.headers["x-page-size"]).toBe("5");
  });

  it("GET /api/cases/:caseId/documents — pagination headers present", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    await createDocument(testCase.id, partner.id);

    const res = await request(app)
      .get(`/api/cases/${testCase.id}/documents?page=1&pageSize=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Number(res.headers["x-total-count"])).toBeGreaterThanOrEqual(1);
    expect(res.headers["x-page"]).toBe("1");
    expect(res.headers["x-page-size"]).toBe("10");
  });

  it("GET /api/cases/:caseId/tasks — pagination headers present", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    await createTask(testCase.id, partner.id, partner.id);

    const res = await request(app)
      .get(`/api/cases/${testCase.id}/tasks?page=1&pageSize=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(Number(res.headers["x-total-count"])).toBeGreaterThanOrEqual(1);
    expect(res.headers["x-page-size"]).toBe("10");
  });
});

describe("Office Staff description redaction (Milestone 4, SRD Section 8 — case metadata only)", () => {
  it("redacts Case.description to null for Office Staff on both listCases and getCase, but not for other roles", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const testCase = await createCase({ partnerId: partner.id });

    const { prisma } = await import("../../src/config/prisma");
    await prisma.case.update({ where: { id: testCase.id }, data: { description: "Confidential case strategy notes" } });

    const listAsOfficeStaff = await request(app).get("/api/cases").set("Authorization", `Bearer ${officeStaffToken}`);
    const found = listAsOfficeStaff.body.find((c: { id: string }) => c.id === testCase.id);
    expect(found.description).toBeNull();

    const listAsPartner = await request(app).get("/api/cases").set("Authorization", `Bearer ${partnerToken}`);
    const foundAsPartner = listAsPartner.body.find((c: { id: string }) => c.id === testCase.id);
    expect(foundAsPartner.description).toBe("Confidential case strategy notes");

    const getAsOfficeStaff = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${officeStaffToken}`);
    expect(getAsOfficeStaff.body.description).toBeNull();

    const getAsPartner = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(getAsPartner.body.description).toBe("Confidential case strategy notes");
  });
});
