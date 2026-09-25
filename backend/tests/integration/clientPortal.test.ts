import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { env } from "../../src/config/env";
import { createUser, createClient, createCase, createDocument, tokenForUser, tokenForClient } from "../helpers/fixtures";

/**
 * Client Portal Permissions (2026-08-14, direct Managing Partner instruction).
 * Covers the Managing Partner's own 22-scenario acceptance list, grouped A-F below.
 */

async function createHearing(caseId: string, createdById: string, overrides?: Partial<{ purpose: string }>) {
  return prisma.hearing.create({
    data: { caseId, hearingDate: new Date("2026-09-01T10:00:00.000Z"), createdById, purpose: overrides?.purpose ?? "Hearing" },
  });
}

describe("Client Portal Permissions — A. new-client defaults", () => {
  it("a newly created client defaults to Cases=ON, Hearing History=ON, Documents=OFF at the DB row, the staff GET response, and the client's own /me", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ name: "New Portal Client" });
    expect(createRes.status).toBe(201);
    const clientId = createRes.body.client.id;

    const row = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(row.portalCasesEnabled).toBe(true);
    expect(row.portalHearingHistoryEnabled).toBe(true);
    expect(row.portalDocumentsEnabled).toBe(false);

    const getRes = await request(app).get(`/api/clients/${clientId}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(getRes.body.portalCasesEnabled).toBe(true);
    expect(getRes.body.portalHearingHistoryEnabled).toBe(true);
    expect(getRes.body.portalDocumentsEnabled).toBe(false);

    const clientToken = await tokenForClient(clientId);
    const meRes = await request(app).get("/api/client-portal/me").set("Authorization", `Bearer ${clientToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.permissions).toEqual({ cases: true, hearingHistory: true, documents: false });
  });
});

describe("Client Portal Permissions — B. client login + default visibility", () => {
  it("POST /api/auth/login/client issues a CLIENT-actorType session for a real client", async () => {
    const client = await createClient();
    const res = await request(app).post("/api/auth/login/client").send({ clientId: client.clientId, password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("default state: GET /client-portal/cases returns the client's own case(s)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForClient(client.id);

    const res = await request(app).get("/api/client-portal/cases").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].case.id).toBe(testCase.id);
  });

  it("default state: GET /client-portal/hearings returns hearings for the client's own case(s)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    await createHearing(testCase.id, partner.id);
    const token = await tokenForClient(client.id);

    const res = await request(app).get("/api/client-portal/hearings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("default state (Documents OFF by default): GET /client-portal/documents returns 403", async () => {
    const client = await createClient();
    const token = await tokenForClient(client.id);
    const res = await request(app).get("/api/client-portal/documents").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("Client Portal Permissions — C. Documents toggle, immediate effect, audit trail", () => {
  it("toggling Documents ON immediately (same token, no re-login) exposes CLIENT_VISIBLE documents and records an audit row; toggling back OFF immediately re-blocks it", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const visibleDoc = await createDocument(testCase.id, partner.id, { confidentiality: "CLIENT_VISIBLE" });
    const internalDoc = await createDocument(testCase.id, partner.id, { confidentiality: "INTERNAL" });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const clientToken = await tokenForClient(client.id);

    const before = await request(app).get("/api/client-portal/documents").set("Authorization", `Bearer ${clientToken}`);
    expect(before.status).toBe(403);

    const onRes = await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: true });
    expect(onRes.status).toBe(200);
    expect(onRes.body.portalDocumentsEnabled).toBe(true);

    const afterOn = await request(app).get("/api/client-portal/documents").set("Authorization", `Bearer ${clientToken}`);
    expect(afterOn.status).toBe(200);
    const ids = afterOn.body.map((d: { id: string }) => d.id);
    expect(ids).toContain(visibleDoc.id);
    expect(ids).not.toContain(internalDoc.id);

    const auditRow = await prisma.auditLog.findFirst({ where: { action: "CLIENT_PORTAL_PERMISSION_CHANGED", entityId: client.id } });
    expect(auditRow).toBeTruthy();
    expect(auditRow?.userId).toBe(partner.id);
    expect((auditRow?.changes as { portalDocumentsEnabled: { old: boolean; new: boolean } })?.portalDocumentsEnabled).toEqual({
      old: false,
      new: true,
    });

    const offRes = await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: false });
    expect(offRes.status).toBe(200);

    const afterOff = await request(app).get("/api/client-portal/documents").set("Authorization", `Bearer ${clientToken}`);
    expect(afterOff.status).toBe(403);

    const secondAuditRow = await prisma.auditLog.findFirst({
      where: { action: "CLIENT_PORTAL_PERMISSION_CHANGED", entityId: client.id },
      orderBy: { createdAt: "desc" },
    });
    expect((secondAuditRow?.changes as { portalDocumentsEnabled: { old: boolean; new: boolean } })?.portalDocumentsEnabled).toEqual({
      old: true,
      new: false,
    });
  });

  it("download: 403 while the flag is off, 200 once toggled on, for a CLIENT_VISIBLE document", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const doc = await createDocument(testCase.id, partner.id, { confidentiality: "CLIENT_VISIBLE" });
    // The fixture's DocumentVersion row references a storagePath with no real file
    // behind it — write one so a genuinely successful download can be exercised
    // (this suite's existing documents.test.ts never tests the success path either,
    // only 404-on-no-access, so there's no shared "real uploaded file" fixture yet).
    const uploadDir = path.resolve(env.uploadDir);
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, "does-not-exist-on-disk.txt"), "test file content");

    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const clientToken = await tokenForClient(client.id);

    const before = await request(app)
      .get(`/api/client-portal/documents/${doc.id}/download`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(before.status).toBe(403);

    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: true });

    const after = await request(app)
      .get(`/api/client-portal/documents/${doc.id}/download`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(after.status).toBe(200);
  });

  it("a no-op PATCH (same value) writes no new audit row", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalCasesEnabled: true }); // already true by default
    expect(res.status).toBe(200);

    const rows = await prisma.auditLog.findMany({ where: { action: "CLIENT_PORTAL_PERMISSION_CHANGED", entityId: client.id } });
    expect(rows).toHaveLength(0);
  });
});

describe("Client Portal Permissions — D. Hearing History and Cases toggles, immediate effect + independence", () => {
  it("toggling Hearing History OFF immediately blocks access, toggling it back ON immediately restores it", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    await createHearing(testCase.id, partner.id);
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const clientToken = await tokenForClient(client.id);

    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalHearingHistoryEnabled: false });
    const off = await request(app).get("/api/client-portal/hearings").set("Authorization", `Bearer ${clientToken}`);
    expect(off.status).toBe(403);

    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalHearingHistoryEnabled: true });
    const on = await request(app).get("/api/client-portal/hearings").set("Authorization", `Bearer ${clientToken}`);
    expect(on.status).toBe(200);
    expect(on.body).toHaveLength(1);
  });

  it("toggling Cases OFF blocks case access while Hearing History remains independently governed by its own flag", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    await createHearing(testCase.id, partner.id);
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const clientToken = await tokenForClient(client.id);

    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalCasesEnabled: false });

    const casesRes = await request(app).get("/api/client-portal/cases").set("Authorization", `Bearer ${clientToken}`);
    expect(casesRes.status).toBe(403);
    const caseDetailRes = await request(app)
      .get(`/api/client-portal/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(caseDetailRes.status).toBe(403);

    // Hearing History is untouched by the Cases toggle — still on, still works.
    const hearingsRes = await request(app).get("/api/client-portal/hearings").set("Authorization", `Bearer ${clientToken}`);
    expect(hearingsRes.status).toBe(200);
    expect(hearingsRes.body).toHaveLength(1);
  });
});

describe("Client Portal Permissions — E. cross-client isolation via crafted ids", () => {
  it("Client A given Client B's real caseId on GET /cases/:caseId gets 404, never leaking existence", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const caseB = await createCase({ partnerId: partner.id, clientIds: [clientB.id] });
    const tokenA = await tokenForClient(clientA.id);

    const res = await request(app).get(`/api/client-portal/cases/${caseB.id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it("Client A given Client B's real caseId as ?caseId= on /hearings gets 404", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const caseB = await createCase({ partnerId: partner.id, clientIds: [clientB.id] });
    await createHearing(caseB.id, partner.id);
    const tokenA = await tokenForClient(clientA.id);

    const res = await request(app).get("/api/client-portal/hearings").query({ caseId: caseB.id }).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it("Client A given Client B's CLIENT_VISIBLE document id gets 404 on download, even with Documents ON for Client A", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const caseB = await createCase({ partnerId: partner.id, clientIds: [clientB.id] });
    const docB = await createDocument(caseB.id, partner.id, { confidentiality: "CLIENT_VISIBLE" });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await request(app)
      .patch(`/api/clients/${clientA.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: true });
    const tokenA = await tokenForClient(clientA.id);

    const res = await request(app)
      .get(`/api/client-portal/documents/${docB.id}/download`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it("Client A's own case list never includes Client B's cases even when both share the same staff Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const caseA = await createCase({ partnerId: partner.id, clientIds: [clientA.id] });
    await createCase({ partnerId: partner.id, clientIds: [clientB.id] });
    const tokenA = await tokenForClient(clientA.id);

    const res = await request(app).get("/api/client-portal/cases").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].case.id).toBe(caseA.id);
  });
});

describe("Client Portal Permissions — F. 403 on modification attempts by a client actor", () => {
  it("POST /api/cases with a CLIENT token — 403", async () => {
    const client = await createClient();
    const token = await tokenForClient(client.id);
    const res = await request(app).post("/api/cases").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  it("PATCH /api/cases/:id with a CLIENT token — 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForClient(client.id);
    const res = await request(app).patch(`/api/cases/${testCase.id}`).set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  it("POST /api/cases/:caseId/documents (upload) with a CLIENT token — 403", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForClient(client.id);
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Sneaky")
      .field("category", "Pleadings")
      .attach("file", Buffer.from("%PDF-1.4\n"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(403);
  });

  it("PATCH /api/clients/:id/portal-permissions with a CLIENT token (client changing their own permissions) — 403", async () => {
    const client = await createClient();
    const token = await tokenForClient(client.id);
    const res = await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ portalDocumentsEnabled: true });
    expect(res.status).toBe(403);
  });
});
