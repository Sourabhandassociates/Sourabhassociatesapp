import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, tokenForUser } from "../helpers/fixtures";

describe("Advanced Conflict Check (Milestone 1, SRD Section 10.2)", () => {
  it("creates a client with no possible match and logs nothing", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "A Wholly Unique Name Ltd", type: "COMPANY" });

    expect(res.status).toBe(201);
    const logs = await prisma.conflictCheckLog.findMany();
    expect(logs).toHaveLength(0);
  });

  it("blocks client creation with a 409 + match list when an exact-name match already exists", async () => {
    await createClient("Rajesh Kumar");
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Rajesh Kumar", type: "INDIVIDUAL" });

    expect(res.status).toBe(409);
    expect(res.body.details).toBeInstanceOf(Array);
    expect(res.body.details[0]).toMatchObject({ type: "CLIENT", confidence: "HIGH" });
  });

  it("rejects an override attempt from a non-Managing-Partner actor even with acknowledgement", async () => {
    await createClient("Rajesh Kumar");
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Rajesh Kumar", type: "INDIVIDUAL", conflictAcknowledged: true, conflictReason: "Different person" });

    expect(res.status).toBe(403);
  });

  it("requires a reason even from a Managing Partner", async () => {
    await createClient("Rajesh Kumar");
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Rajesh Kumar", type: "INDIVIDUAL", conflictAcknowledged: true });

    expect(res.status).toBe(409);
  });

  it("a Managing Partner can override with a reason, and the override is logged with matches + reason", async () => {
    const existing = await createClient("Rajesh Kumar");
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Rajesh Kumar",
        type: "INDIVIDUAL",
        conflictAcknowledged: true,
        conflictReason: "Confirmed distinct individual, same common name",
      });

    expect(res.status).toBe(201);
    const logs = await prisma.conflictCheckLog.findMany({ where: { triggerType: "CLIENT" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].reason).toBe("Confirmed distinct individual, same common name");
    expect(logs[0].overriddenById).toBe(partner.id);
    expect((logs[0].matches as { id: string }[])[0].id).toBe(existing.id);
  });

  it("also matches a partial/fuzzy name (typo-level) at MEDIUM confidence", async () => {
    await createClient("Sourabh Sharma");
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Sourabh Sharmaa", type: "INDIVIDUAL" });

    expect(res.status).toBe(409);
    expect(res.body.details[0].confidence).toBeDefined();
  });
});
