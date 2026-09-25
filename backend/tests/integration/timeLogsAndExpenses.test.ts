import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";

describe("Time Tracking (Milestone 2, SRD Section 16.1)", () => {
  it("POST /api/cases/:caseId/time-logs — an Associate can log billable hours", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 2.5, description: "Drafting" });

    expect(res.status).toBe(201);
    expect(res.body.hours).toBe(2.5);
  });

  it("rejects Office Staff (no TIMELOGS.CREATE by default)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const staff = await createUser("OFFICE_STAFF");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 1 });
    expect(res.status).toBe(403);
  });

  it("rejects zero/negative hours", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 0 });
    expect(res.status).toBe(400);
  });

  it("firm-wide audit trail expansion (2026-08-13): create/update/delete on a time log each produce an audit entry with a structured diff", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 2, description: "Research" });
    expect(created.status).toBe(201);

    const createdLog = await prisma.auditLog.findFirst({
      where: { entityType: "TimeLog", entityId: created.body.id, action: "TIME_LOG_CREATED" },
    });
    expect(createdLog).not.toBeNull();

    const updated = await request(app)
      .patch(`/api/time-logs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hours: 4 });
    expect(updated.status).toBe(200);

    const updateLog = await prisma.auditLog.findFirst({
      where: { entityType: "TimeLog", entityId: created.body.id, action: "TIME_LOG_UPDATED" },
    });
    expect(updateLog).not.toBeNull();
    expect((updateLog?.changes as { hours?: { old: number; new: number } } | null)?.hours).toEqual({ old: 2, new: 4 });

    const del = await request(app).delete(`/api/time-logs/${created.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const deleteLog = await prisma.auditLog.findFirst({
      where: { entityType: "TimeLog", entityId: created.body.id, action: "TIME_LOG_DELETED" },
    });
    expect(deleteLog).not.toBeNull();
    expect(deleteLog?.details).toContain("4h");
  });

  it("PATCH/DELETE reject a time log that has already been invoiced", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const log = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), hours: 3 });

    await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: log.body.id, rate: 100 }] });

    const patch = await request(app)
      .patch(`/api/time-logs/${log.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hours: 5 });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/api/time-logs/${log.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(403);
  });
});

describe("Expense Management (Milestone 2, SRD Section 16.2)", () => {
  it("POST /api/cases/:caseId/expenses — logs an expense", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Travel", amount: 500, date: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe("Travel");
  });

  it("Accounts Team can log and view expenses", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const accounts = await createUser("ACCOUNTS_TEAM");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");

    const create = await request(app)
      .post(`/api/cases/${testCase.id}/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Courier", amount: 50, date: new Date().toISOString() });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/cases/${testCase.id}/expenses`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("DELETE soft-deletes into the Recycle Bin, restorable by the Managing Partner (sixth entity)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Printing", amount: 20, date: new Date().toISOString() });

    const del = await request(app).delete(`/api/expenses/${created.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/cases/${testCase.id}/expenses`).set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(0);

    const bin = await request(app).get("/api/recycle-bin").set("Authorization", `Bearer ${token}`);
    expect(bin.body.some((e: { entityType: string; id: string }) => e.entityType === "Expense" && e.id === created.body.id)).toBe(
      true
    );

    const restore = await request(app)
      .post(`/api/recycle-bin/Expense/${created.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);
    expect(restore.status).toBe(204);

    const afterRestore = await prisma.expense.findUnique({ where: { id: created.body.id } });
    expect(afterRestore?.deletedAt).toBeNull();
  });

  it("rejects a Junior Associate deleting an expense (EXPENSES.DELETE defaults false for Junior)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const junior = await createUser("JUNIOR_ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [junior.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const juniorToken = await tokenForUser(junior.id, "JUNIOR_ASSOCIATE");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ category: "Miscellaneous", amount: 10, date: new Date().toISOString() });

    const del = await request(app).delete(`/api/expenses/${created.body.id}`).set("Authorization", `Bearer ${juniorToken}`);
    expect(del.status).toBe(403);
  });
});
