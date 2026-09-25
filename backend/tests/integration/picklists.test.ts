import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE");
  return {
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
  };
}

describe("Admin-managed dropdown values (Step 1 revision, item 8)", () => {
  it("GET /api/picklists/:category — any staff member can read active values", async () => {
    const { associateToken } = await setup();
    const res = await request(app)
      .get("/api/picklists/CASE_STAGE")
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/picklists/:category — rejects an unknown category", async () => {
    const { associateToken } = await setup();
    const res = await request(app)
      .get("/api/picklists/NOT_A_CATEGORY")
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(400);
  });

  it("POST /api/picklists/:category — rejected for a non-Managing-Partner", async () => {
    const { associateToken } = await setup();
    const res = await request(app)
      .post("/api/picklists/COURT")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ value: "Delhi High Court" });
    expect(res.status).toBe(403);
  });

  it("POST /api/picklists/:category — Managing Partner can add a value, and it then appears in the list", async () => {
    const { partnerToken } = await setup();
    const created = await request(app)
      .post("/api/picklists/COURT")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ value: "Bombay High Court" });
    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/picklists/COURT")
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(list.body.some((v: { value: string }) => v.value === "Bombay High Court")).toBe(true);
  });

  it("POST /api/picklists/:category — rejects a duplicate active value", async () => {
    const { partnerToken } = await setup();
    await request(app)
      .post("/api/picklists/COURT")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ value: "Madras High Court" });
    const dupe = await request(app)
      .post("/api/picklists/COURT")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ value: "Madras High Court" });
    expect(dupe.status).toBe(409);
  });

  it("PATCH /api/picklists/values/:id — Managing Partner can deactivate a value, and it disappears from the active list", async () => {
    const { partnerToken } = await setup();
    const created = await request(app)
      .post("/api/picklists/DEPARTMENT")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ value: "Litigation" });

    const deactivated = await request(app)
      .patch(`/api/picklists/values/${created.body.id}`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);

    const list = await request(app)
      .get("/api/picklists/DEPARTMENT")
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(list.body.some((v: { id: string }) => v.id === created.body.id)).toBe(false);
  });

  it("PATCH /api/picklists/values/:id — rejected for a non-Managing-Partner", async () => {
    const { partnerToken, associateToken } = await setup();
    const created = await request(app)
      .post("/api/picklists/DEPARTMENT")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ value: "Corporate" });

    const res = await request(app)
      .patch(`/api/picklists/values/${created.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });
});
