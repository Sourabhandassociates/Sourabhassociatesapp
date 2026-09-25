import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";
import { prisma } from "../../src/config/prisma";

describe("POST /api/clients (create)", () => {
  it("rejects an Associate (not in the allowed role list)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Client", type: "INDIVIDUAL" });
    expect(res.status).toBe(403);
  });

  it("allows Office Staff and generates a sequential Client ID", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Client", type: "INDIVIDUAL" });
    expect(res.status).toBe(201);
    expect(res.body.client.clientId).toMatch(/^SA-CLI-\d{6}$/);
    expect(res.body.temporaryPassword).toBeTruthy();
  });

  it("Step 4 — accepts a Client Type value outside the old fixed enum, proving the picklist conversion removed the DB-level constraint", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Client", type: "Partnership Firm" });
    expect(res.status).toBe(201);
    expect(res.body.client.type).toBe("Partnership Firm");
  });
});

describe("Client-module optional-fields pass (2026-08-06) — only Name is mandatory", () => {
  it("creates a client with only a name, leaving Type/Email/Phone/Address all null", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({ name: "Name Only Client" });
    expect(res.status).toBe(201);
    expect(res.body.client.type).toBeNull();
    expect(res.body.client.email).toBeNull();
    expect(res.body.client.phone).toBeNull();

    const fetched = await request(app).get(`/api/clients/${res.body.client.id}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.address).toBeNull();
  });

  it("treats blank/whitespace-only optional fields the same as omitted — stored as null, not empty strings", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Blank Fields Client", type: "   ", phone: "", address: "   " });
    expect(res.status).toBe(201);
    expect(res.body.client.type).toBeNull();
  });

  it("rejects an email that doesn't look like an email, but accepts a blank one", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const bad = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad Email Client", email: "not-an-email" });
    expect(bad.status).toBe(400);

    const blank = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Blank Email Client", email: "" });
    expect(blank.status).toBe(201);
    expect(blank.body.client.email).toBeNull();
  });

  it("still requires a name", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({ type: "INDIVIDUAL" });
    expect(res.status).toBe(400);
  });

  it("lets Type/Email/Phone/Address be added later via edit, on a client created with only a name", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const created = await request(app).post("/api/clients").set("Authorization", `Bearer ${token}`).send({ name: "Fill In Later" });
    const clientId = created.body.client.id;

    const updated = await request(app)
      .patch(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "Corporate", email: "later@test.local", phone: "9876543210", address: "New Delhi" });
    expect(updated.status).toBe(200);
    expect(updated.body.type).toBe("Corporate");
    expect(updated.body.email).toBe("later@test.local");
    expect(updated.body.phone).toBe("9876543210");
    expect(updated.body.address).toBe("New Delhi");
  });

  it("lets a previously-set optional field be cleared back to null via edit", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const created = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Clear Me", type: "INDIVIDUAL", phone: "1112223333" });
    const clientId = created.body.client.id;

    const cleared = await request(app)
      .patch(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "", phone: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.type).toBeNull();
    expect(cleared.body.phone).toBeNull();
  });

  it("omitting a field on edit leaves it unchanged (only present fields are touched)", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const created = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Partial Edit", type: "INDIVIDUAL", phone: "1112223333" });
    const clientId = created.body.client.id;

    const partial = await request(app)
      .patch(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ address: "Mumbai" });
    expect(partial.status).toBe(200);
    expect(partial.body.type).toBe("INDIVIDUAL");
    expect(partial.body.phone).toBe("1112223333");
    expect(partial.body.address).toBe("Mumbai");
  });
});

describe("Row-level access to clients (SRD 3.2: Associates only see clients on their own cases)", () => {
  async function setup() {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE", "Assigned Associate");
    const outsider = await createUser("ASSOCIATE", "Outsider Associate");
    const client = await createClient("Rajesh Kumar");
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    return {
      client,
      associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
      outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
    };
  }

  it("GET /api/clients — an unrelated Associate sees no clients", async () => {
    const { outsiderToken } = await setup();
    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("GET /api/clients — the assigned Associate sees the client", async () => {
    const { associateToken } = await setup();
    const res = await request(app).get("/api/clients").set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty("passwordHash");
  });

  it("GET /api/clients/:id — 404s for an unrelated Associate", async () => {
    const { client, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/clients/:id — succeeds for the assigned Associate and never includes passwordHash", async () => {
    const { client, associateToken } = await setup();
    const res = await request(app)
      .get(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("PATCH /api/clients/:id — 404s for an unrelated Associate", async () => {
    const { client, outsiderToken } = await setup();
    const res = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/clients/:id/status — rejects a non-Partner", async () => {
    const { client, associateToken } = await setup();
    const res = await request(app)
      .patch(`/api/clients/${client.id}/status`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "BLACKLISTED" });
    expect(res.status).toBe(403);
  });
});

describe("Firm-wide audit trail expansion (2026-08-13) — Client coverage gaps", () => {
  it("PATCH /api/clients/:id logs CLIENT_UPDATED with a structured old/new diff", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient("Original Name");

    const res = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Client", entityId: client.id, action: "CLIENT_UPDATED" },
    });
    expect(entry?.changes).toMatchObject({ name: { old: "Original Name", new: "Updated Name" } });
  });

  it("PATCH /api/clients/:id/status logs CLIENT_STATUS_CHANGED with the actor attributed", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient("Blacklist Candidate");

    const res = await request(app)
      .patch(`/api/clients/${client.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "BLACKLISTED" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Client", entityId: client.id, action: "CLIENT_STATUS_CHANGED" },
    });
    expect(entry?.userId).toBe(partner.id);
    expect(entry?.changes).toEqual({ status: { old: "ACTIVE", new: "BLACKLISTED" } });
  });
});
