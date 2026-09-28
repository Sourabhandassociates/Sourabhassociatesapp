import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";

describe("Reports & Analytics (Milestone 3, SRD Section 19)", () => {
  it("rejects a role without REPORTS.VIEW (Associate)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app).get("/api/reports/case-summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/reports/types — lists every report type for a Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/reports/types").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("case-summary");
    expect(res.body).toContain("financial");
    expect(res.body).toContain("client-list");
  });

  it("case-summary report includes a created case", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app).get("/api/reports/case-summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: { matterNumber: string }) => r.matterNumber === testCase.matterNumber)).toBe(true);
  });

  it("financial report reflects a recorded payment as revenue", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 2 });
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 500 }] });
    await request(app).patch(`/api/invoices/${invoice.body.id}/approve`).set("Authorization", `Bearer ${token}`);
    await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1000 });

    const res = await request(app).get("/api/reports/financial").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const revenueRow = res.body.rows.find((r: { metric: string }) => r.metric.includes("Revenue"));
    expect(revenueRow.value).toBeGreaterThanOrEqual(1000);
  });

  it("export format (pdf/excel) requires REPORTS.EXPORT even when REPORTS.VIEW is held", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const accounts = await createUser("ACCOUNTS_TEAM");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const accountsToken = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");

    const exportPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "REPORTS.EXPORT" } });
    await prisma.userPermissionOverride.create({
      data: {
        userId: accounts.id,
        permissionId: exportPermission.id,
        effect: "REVOKE",
        reason: "Testing view/export permission split",
        setById: partner.id,
      },
    });

    const jsonRes = await request(app).get("/api/reports/case-summary").set("Authorization", `Bearer ${accountsToken}`);
    expect(jsonRes.status).toBe(200);

    const pdfRes = await request(app)
      .get("/api/reports/case-summary")
      .query({ format: "pdf" })
      .set("Authorization", `Bearer ${accountsToken}`);
    expect(pdfRes.status).toBe(403);

    const stillWorksForPartner = await request(app)
      .get("/api/reports/case-summary")
      .query({ format: "pdf" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(stillWorksForPartner.status).toBe(200);
    expect(stillWorksForPartner.headers["content-type"]).toContain("application/pdf");
  });
});
