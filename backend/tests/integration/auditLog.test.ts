import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { diffObjects } from "../../src/utils/auditLog";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

/**
 * Firm-wide audit trail expansion (2026-08-13) — covers what the pre-existing
 * `adminCustomization.test.ts` "Audit Log Viewer" block doesn't: the new structured
 * `changes` diff, `entityName` search, the no-op-update-skips-the-write guarantee,
 * the sensitive-field redaction blocklist, automatic ipAddress/sessionId capture via
 * AsyncLocalStorage, and tamper-resistance (no mutation route exists at all).
 */
describe("Audit Log — structured changes and entityName (firm-wide expansion)", () => {
  it("records a structured old/new diff for a Case update, visible via the API", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ practiceArea: "Corporate Law" });
    expect(res.status).toBe(200);

    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${token}`)
      .query({ action: "CASE_UPDATED" });
    const entry = log.body.entries.find((e: { entityId: string }) => e.entityId === testCase.id);
    expect(entry).toBeDefined();
    expect(entry.entityName).toBe(testCase.matterNumber);
    expect(entry.changes.practiceArea).toEqual({ old: "Test", new: "Corporate Law" });
  });

  it("filters by entityName (case-insensitive contains)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    // The fixture's createCase() writes directly via Prisma (bypassing the service
    // layer, so it produces no CASE_CREATED audit row) — trigger a real API update
    // to get an entry with entityName set.
    await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ practiceArea: "Environmental Law" });

    const res = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${token}`)
      .query({ entityName: testCase.matterNumber.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e: { entityId: string }) => e.entityId === testCase.id)).toBe(true);
  });

  it("does not write a new CASE_UPDATED row for a no-op update (identical values)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const before = await prisma.auditLog.count({ where: { entityId: testCase.id, action: "CASE_UPDATED" } });
    const res = await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ practiceArea: "Test" }); // identical to the fixture's existing value
    expect(res.status).toBe(200);
    const after = await prisma.auditLog.count({ where: { entityId: testCase.id, action: "CASE_UPDATED" } });
    expect(after).toBe(before);
  });

  it("captures ipAddress and sessionId automatically via AsyncLocalStorage", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .patch(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ practiceArea: "Family Law" });

    const entry = await prisma.auditLog.findFirst({
      where: { entityId: testCase.id, action: "CASE_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry?.ipAddress).toBeTruthy();
    expect(entry?.sessionId).toBeTruthy();
    expect(entry?.userRole).toBe("MANAGING_PARTNER");
  });
});

describe("Audit Log — diffObjects redaction and no-op semantics (unit-level)", () => {
  it("never includes sensitive fields even when their value differs", () => {
    const before = { name: "Old Name", passwordHash: "hash-a", mfaSecretEncrypted: "secret-a" };
    const after = { name: "New Name", passwordHash: "hash-b", mfaSecretEncrypted: "secret-b" };
    const changes = diffObjects(before, after);
    expect(changes).toEqual({ name: { old: "Old Name", new: "New Name" } });
    expect(changes).not.toHaveProperty("passwordHash");
    expect(changes).not.toHaveProperty("mfaSecretEncrypted");
  });

  it("returns null (not an empty object) when nothing changed", () => {
    const record = { name: "Same", status: "ACTIVE" };
    expect(diffObjects(record, { ...record })).toBeNull();
  });

  it("normalizes Date comparisons by instant, not reference", () => {
    const before = { dueDate: new Date("2026-08-13T00:00:00.000Z") };
    const after = { dueDate: new Date("2026-08-13T00:00:00.000Z") };
    expect(diffObjects(before, after)).toBeNull();

    const changed = diffObjects(before, { dueDate: new Date("2026-08-14T00:00:00.000Z") });
    expect(changed?.dueDate.old).toBe("2026-08-13T00:00:00.000Z");
    expect(changed?.dueDate.new).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("Audit Log — tamper-resistance", () => {
  it("exposes no route capable of modifying or deleting audit entries", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const anyEntry = await prisma.auditLog.findFirst();

    const patchRes = await request(app).patch("/api/audit-log").set("Authorization", `Bearer ${token}`).send({});
    expect(patchRes.status).toBe(404);

    const putRes = await request(app).put("/api/audit-log").set("Authorization", `Bearer ${token}`).send({});
    expect(putRes.status).toBe(404);

    if (anyEntry) {
      const deleteRes = await request(app)
        .delete(`/api/audit-log/${anyEntry.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(deleteRes.status).toBe(404);
    }
  });
});
