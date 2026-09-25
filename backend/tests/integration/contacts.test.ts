import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

describe("Contact Directory — manually-managed (non-client) contacts, SRD Section 12", () => {
  it("POST /api/contacts — an Associate can create a contact", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");

    const res = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Adv. Priya Menon", category: "Opposite Advocate", organization: "Menon & Co." });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Adv. Priya Menon");
  });

  it("POST /api/contacts — rejects Accounts Team (view-only per SRD Section 8 matrix)", async () => {
    const accounts = await createUser("ACCOUNTS_TEAM");
    const token = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");

    const res = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Some Contact", category: "Judge" });

    expect(res.status).toBe(403);
  });

  it("GET /api/contacts — Accounts Team can view (view-only access)", async () => {
    const accounts = await createUser("ACCOUNTS_TEAM");
    const token = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");

    const res = await request(app).get("/api/contacts").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("GET /api/contacts?search= filters by name", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Justice A. Rao", category: "Judge" });
    await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "CA Meera Iyer", category: "Chartered Accountant" });

    const res = await request(app).get("/api/contacts?search=Rao").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Justice A. Rao");
  });

  it("PATCH /api/contacts/:id updates fields and audit-logs the change", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const created = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Expert Witness", category: "Expert" });

    const res = await request(app)
      .patch(`/api/contacts/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "9999999999" });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("9999999999");
    const audit = await prisma.auditLog.findMany({ where: { entityType: "Contact", action: "CONTACT_UPDATED" } });
    expect(audit).toHaveLength(1);
  });

  it("DELETE /api/contacts/:id soft-deletes into the Recycle Bin, restorable by the Managing Partner", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const staffToken = await tokenForUser(staff.id, "OFFICE_STAFF");
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const created = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ name: "Retiring Contact", category: "Other" });

    const del = await request(app)
      .delete(`/api/contacts/${created.body.id}`)
      .set("Authorization", `Bearer ${staffToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/contacts").set("Authorization", `Bearer ${staffToken}`);
    expect(list.body.some((c: { id: string }) => c.id === created.body.id)).toBe(false);

    const bin = await request(app).get("/api/recycle-bin").set("Authorization", `Bearer ${partnerToken}`);
    expect(bin.body.some((e: { entityType: string; id: string }) => e.entityType === "Contact" && e.id === created.body.id)).toBe(
      true
    );

    const restore = await request(app)
      .post(`/api/recycle-bin/Contact/${created.body.id}/restore`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(restore.status).toBe(204);

    const afterRestore = await request(app).get("/api/contacts").set("Authorization", `Bearer ${staffToken}`);
    expect(afterRestore.body.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
  });

  it("POST /api/contacts/:id/matters links a contact to a case, visible on the Contact Detail response", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const created = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ name: "Opposite Counsel Contact", category: "Opposite Advocate" });

    const link = await request(app)
      .post(`/api/contacts/${created.body.id}/matters`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id });
    expect(link.status).toBe(201);

    const detail = await request(app)
      .get(`/api/contacts/${created.body.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(detail.body.matters).toHaveLength(1);
    expect(detail.body.matters[0].case.id).toBe(testCase.id);
  });

  it("POST /api/contacts ignores a clientId in the body — manual creation can never produce a client-linked row", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Should Not Be Linked Client" });

    const created = await request(app)
      .post("/api/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Sneaky Contact", category: "Other", clientId: client.body.client.id });
    expect(created.status).toBe(201);

    const stored = await prisma.contact.findUnique({ where: { id: created.body.id } });
    expect(stored?.clientId).toBeNull();
  });
});

describe("Contacts redesign pass (2026-08-07b) — Client Contacts directory, auto-synced from the Client module", () => {
  it("creating a Client automatically creates its Contacts-directory entry, with no separate action", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Auto-Synced Client", email: "auto@client.test", phone: "9000000001" });
    expect(client.status).toBe(201);

    const directory = await request(app).get("/api/contacts/client-directory").set("Authorization", `Bearer ${token}`);
    expect(directory.status).toBe(200);
    const row = directory.body.find((r: { client: { id: string } }) => r.client.id === client.body.client.id);
    expect(row).toBeTruthy();
    expect(row.contactName).toBe("Auto-Synced Client");
    expect(row.email).toBe("auto@client.test");
    expect(row.mobile).toBe("9000000001");
    expect(row.client.name).toBe("Auto-Synced Client");
  });

  it("editing a Client keeps its Contacts-directory entry synchronized", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Before Edit Name" });

    await request(app)
      .patch(`/api/clients/${client.body.client.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "After Edit Name", email: "after@client.test", phone: "9000000002" });

    const directory = await request(app).get("/api/contacts/client-directory").set("Authorization", `Bearer ${token}`);
    const row = directory.body.find((r: { client: { id: string } }) => r.client.id === client.body.client.id);
    expect(row.contactName).toBe("After Edit Name");
    expect(row.email).toBe("after@client.test");
    expect(row.mobile).toBe("9000000002");
  });

  it("GET /api/contacts/client-directory?search= matches on contact or client name", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({ name: "Findable Directory Client" });

    const res = await request(app)
      .get("/api/contacts/client-directory")
      .query({ search: "Findable Directory" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((r: { client: { name: string } }) => r.client.name.includes("Findable Directory"))).toBe(true);
  });

  it("a soft-deleted Client's row disappears from the directory, and reappears once restored", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const staffToken = await tokenForUser(staff.id, "OFFICE_STAFF");
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ name: "Delete-Restore Directory Client" });

    let directory = await request(app).get("/api/contacts/client-directory").set("Authorization", `Bearer ${staffToken}`);
    expect(directory.body.some((r: { client: { id: string } }) => r.client.id === client.body.client.id)).toBe(true);

    await request(app).delete(`/api/clients/${client.body.client.id}`).set("Authorization", `Bearer ${partnerToken}`);

    directory = await request(app).get("/api/contacts/client-directory").set("Authorization", `Bearer ${staffToken}`);
    expect(directory.body.some((r: { client: { id: string } }) => r.client.id === client.body.client.id)).toBe(false);

    await request(app)
      .post(`/api/recycle-bin/Client/${client.body.client.id}/restore`)
      .set("Authorization", `Bearer ${partnerToken}`);

    directory = await request(app).get("/api/contacts/client-directory").set("Authorization", `Bearer ${staffToken}`);
    expect(directory.body.some((r: { client: { id: string } }) => r.client.id === client.body.client.id)).toBe(true);
  });

  it("permanently deleting a Client cascades to remove its Contacts-directory row", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const staffToken = await tokenForUser(staff.id, "OFFICE_STAFF");
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ name: "Permanent Delete Directory Client" });

    await request(app).delete(`/api/clients/${client.body.client.id}`).set("Authorization", `Bearer ${partnerToken}`);
    const del = await request(app)
      .delete(`/api/recycle-bin/Client/${client.body.client.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(del.status).toBe(204);

    const stored = await prisma.contact.findUnique({ where: { clientId: client.body.client.id } });
    expect(stored).toBeNull();
  });

  it("a client-linked Contact cannot be edited or deleted directly through the Contacts API", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Not Directly Editable Client" });

    const linked = await prisma.contact.findUniqueOrThrow({ where: { clientId: client.body.client.id } });

    const editAttempt = await request(app)
      .patch(`/api/contacts/${linked.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Hijacked Name" });
    expect(editAttempt.status).toBe(400);

    const deleteAttempt = await request(app).delete(`/api/contacts/${linked.id}`).set("Authorization", `Bearer ${token}`);
    expect(deleteAttempt.status).toBe(400);
  });

  it("GET /api/contacts (the manual list) never includes client-linked rows", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Excluded From Manual List Client" });
    const linked = await prisma.contact.findUniqueOrThrow({ where: { clientId: client.body.client.id } });

    const manualList = await request(app).get("/api/contacts").set("Authorization", `Bearer ${token}`);
    expect(manualList.body.some((c: { id: string }) => c.id === linked.id)).toBe(false);
  });
});
