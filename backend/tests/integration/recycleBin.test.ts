import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import {
  createUser,
  createClient,
  createCase,
  createTask,
  createDocument,
  tokenForUser,
} from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const client = await createClient();
  const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
  const task = await createTask(testCase.id, associate.id, associate.id);
  const document = await createDocument(testCase.id, associate.id);

  return {
    partner,
    associate,
    outsider,
    client,
    case: testCase,
    task,
    document,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
  };
}

describe("Soft delete (Step 2 — SRD Section 27): Case", () => {
  it("DELETE /api/cases/:id soft-deletes; the case then 404s and disappears from the list", async () => {
    const { case: testCase, associateToken } = await setup();
    const del = await request(app)
      .delete(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(del.status).toBe(204);

    const get = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(get.status).toBe(404);

    const list = await request(app).get("/api/cases").set("Authorization", `Bearer ${associateToken}`);
    expect(list.body.some((c: { id: string }) => c.id === testCase.id)).toBe(false);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_DELETED" },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it("DELETE /api/cases/:id — 404s for an unrelated Associate (row-level scoping still applies)", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .delete(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Soft delete (Step 2): Client", () => {
  it("DELETE /api/clients/:id — Managing-Partner-only", async () => {
    const { client, associateToken } = await setup();
    const res = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/clients/:id soft-deletes; disappears from list and blocks client login", async () => {
    const { client, partnerToken } = await setup();
    const del = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/clients").set("Authorization", `Bearer ${partnerToken}`);
    expect(list.body.some((c: { id: string }) => c.id === client.id)).toBe(false);

    const login = await request(app)
      .post("/api/auth/login/client")
      .send({ clientId: client.clientId, password: "irrelevant" });
    expect(login.status).toBe(401);
  });
});

describe("Soft delete (Step 2): Document", () => {
  it("DELETE /api/documents/:id soft-deletes; disappears from the case's document list", async () => {
    const { document, case: testCase, associateToken } = await setup();
    const del = await request(app)
      .delete(`/api/documents/${document.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(del.status).toBe(204);

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(list.body.some((d: { id: string }) => d.id === document.id)).toBe(false);

    const get = await request(app)
      .get(`/api/documents/${document.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(get.status).toBe(404);
  });
});

describe("Soft delete (Step 2): Task", () => {
  it("DELETE /api/tasks/:id soft-deletes; disappears from My Tasks and the firm-wide list", async () => {
    const { task, associate, associateToken, partnerToken } = await setup();
    const del = await request(app)
      .delete(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(del.status).toBe(204);

    const mine = await request(app).get("/api/tasks/my").set("Authorization", `Bearer ${associateToken}`);
    expect(mine.body.some((t: { id: string }) => t.id === task.id)).toBe(false);

    const all = await request(app).get("/api/tasks/all").set("Authorization", `Bearer ${partnerToken}`);
    expect(all.body.some((t: { id: string }) => t.id === task.id)).toBe(false);

    const audit = await request(app)
      .get(`/api/tasks/audit/${associate.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(audit.body.tasks.some((t: { id: string }) => t.id === task.id)).toBe(false);
  });
});

describe("Recycle Bin (Step 2 — SRD Section 27)", () => {
  it("GET /api/recycle-bin — rejected for non-Managing-Partner", async () => {
    const { associateToken } = await setup();
    const res = await request(app).get("/api/recycle-bin").set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("lists a deleted record with its label and who deleted it", async () => {
    const { case: testCase, associate, associateToken, partnerToken } = await setup();
    await request(app).delete(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);

    const res = await request(app).get("/api/recycle-bin").set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.find(
      (e: { entityType: string; id: string }) => e.entityType === "Case" && e.id === testCase.id
    );
    expect(entry).toBeDefined();
    expect(entry.label).toContain(testCase.matterNumber);
    expect(entry.deletedBy.id).toBe(associate.id);
  });

  it("POST /:entityType/:id/restore — rejected for non-Managing-Partner", async () => {
    const { case: testCase, associateToken } = await setup();
    await request(app).delete(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);
    const res = await request(app)
      .post(`/api/recycle-bin/Case/${testCase.id}/restore`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("restore brings the case back with its relationships intact", async () => {
    const { case: testCase, associateToken, partnerToken } = await setup();
    await request(app).delete(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);

    const restore = await request(app)
      .post(`/api/recycle-bin/Case/${testCase.id}/restore`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(restore.status).toBe(204);

    const get = await request(app)
      .get(`/api/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(get.status).toBe(200);
    expect(get.body.advocates).toHaveLength(1);
    expect(get.body.clients).toHaveLength(1);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_RESTORED" },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it("restore 404s for a case that isn't in the bin (not soft-deleted)", async () => {
    const { case: testCase, partnerToken } = await setup();
    const res = await request(app)
      .post(`/api/recycle-bin/Case/${testCase.id}/restore`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(404);
  });

  it("DELETE /:entityType/:id (permanent) — rejected for non-Managing-Partner", async () => {
    const { case: testCase, associateToken } = await setup();
    await request(app).delete(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);
    const res = await request(app)
      .delete(`/api/recycle-bin/Case/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("permanent delete 404s for a live (not soft-deleted) case — even the Managing Partner cannot skip the soft-delete step", async () => {
    const { case: testCase, partnerToken } = await setup();
    const res = await request(app)
      .delete(`/api/recycle-bin/Case/${testCase.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(404);
    expect(await prisma.case.findUnique({ where: { id: testCase.id } })).not.toBeNull();
  });

  it("permanently deleting a case cascades to its tasks and documents (and document versions)", async () => {
    const { case: testCase, task, document, associateToken, partnerToken } = await setup();
    await request(app).delete(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${associateToken}`);

    const del = await request(app)
      .delete(`/api/recycle-bin/Case/${testCase.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(del.status).toBe(204);

    expect(await prisma.case.findUnique({ where: { id: testCase.id } })).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.document.findUnique({ where: { id: document.id } })).toBeNull();
    expect(await prisma.documentVersion.findMany({ where: { documentId: document.id } })).toHaveLength(0);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: "Case", entityId: testCase.id, action: "CASE_PERMANENTLY_DELETED" },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it("permanently deleting a document removes its versions and (best-effort) leaves no dangling references", async () => {
    const { document, associateToken, partnerToken } = await setup();
    await request(app).delete(`/api/documents/${document.id}`).set("Authorization", `Bearer ${associateToken}`);

    const del = await request(app)
      .delete(`/api/recycle-bin/Document/${document.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(del.status).toBe(204);

    expect(await prisma.document.findUnique({ where: { id: document.id } })).toBeNull();
    expect(await prisma.documentVersion.findMany({ where: { documentId: document.id } })).toHaveLength(0);
  });

  it("GET /api/recycle-bin/... — rejects an unknown entity type", async () => {
    const { partnerToken } = await setup();
    const res = await request(app)
      .post("/api/recycle-bin/NotAThing/some-id/restore")
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(400);
  });
});
