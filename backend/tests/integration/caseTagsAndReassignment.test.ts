import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

describe("Case Tagging (Milestone 1, SRD Section 10.3)", () => {
  it("POST /api/cases/:id/tags adds a tag, visible on the case and via the list-by-tag filter", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const add = await request(app)
      .post(`/api/cases/${testCase.id}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tag: "Arbitration" });
    expect(add.status).toBe(201);

    const detail = await request(app).get(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${token}`);
    expect(detail.body.tags.map((t: { tag: string }) => t.tag)).toEqual(["Arbitration"]);

    const filtered = await request(app).get("/api/cases?tag=Arbitration").set("Authorization", `Bearer ${token}`);
    expect(filtered.body.some((c: { id: string }) => c.id === testCase.id)).toBe(true);

    const filteredOther = await request(app).get("/api/cases?tag=GST").set("Authorization", `Bearer ${token}`);
    expect(filteredOther.body.some((c: { id: string }) => c.id === testCase.id)).toBe(false);
  });

  it("adding the same tag twice is a no-op (unique constraint honored via upsert)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    await request(app)
      .post(`/api/cases/${testCase.id}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tag: "GST" });
    const second = await request(app)
      .post(`/api/cases/${testCase.id}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tag: "GST" });
    expect(second.status).toBe(201);

    const tags = await prisma.caseTag.findMany({ where: { caseId: testCase.id } });
    expect(tags).toHaveLength(1);
  });

  it("DELETE /api/cases/:id/tags/:tag removes a tag", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });
    await request(app)
      .post(`/api/cases/${testCase.id}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tag: "Civil" });

    const del = await request(app)
      .delete(`/api/cases/${testCase.id}/tags/Civil`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const tags = await prisma.caseTag.findMany({ where: { caseId: testCase.id } });
    expect(tags).toHaveLength(0);
  });

  it("rejects a Junior Associate (no CASES.EDIT permission by default)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const junior = await createUser("JUNIOR_ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [junior.id] });
    const token = await tokenForUser(junior.id, "JUNIOR_ASSOCIATE");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/tags`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tag: "Property" });
    expect(res.status).toBe(403);
  });
});

describe("Case Reassignment (Milestone 1, SRD Section 10.1 — Partner-only, with audit trail)", () => {
  it("PATCH /api/cases/:id/reassign moves the case to a new Managing Partner and logs it", async () => {
    const oldPartner = await createUser("MANAGING_PARTNER", "Old Partner");
    const newPartner = await createUser("MANAGING_PARTNER", "New Partner");
    const token = await tokenForUser(oldPartner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: oldPartner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ partnerId: newPartner.id });

    expect(res.status).toBe(200);
    expect(res.body.partnerId).toBe(newPartner.id);

    const updated = await prisma.case.findUnique({ where: { id: testCase.id } });
    expect(updated?.partnerId).toBe(newPartner.id);

    const audit = await prisma.auditLog.findMany({ where: { entityType: "Case", action: "CASE_REASSIGNED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toContain("Old Partner -> New Partner");
  });

  it("rejects an Associate (CASES.REASSIGN defaults to Managing-Partner-only)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const otherPartner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ partnerId: otherPartner.id });
    expect(res.status).toBe(403);
  });

  it("rejects reassigning to a non-Partner user", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ partnerId: associate.id });
    expect(res.status).toBe(400);
  });

  it("rejects reassigning to the same partner already on the case", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .patch(`/api/cases/${testCase.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ partnerId: partner.id });
    expect(res.status).toBe(400);
  });
});
