import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";

describe("Global Search (Milestone 3, SRD Section 23)", () => {
  it("GET /api/search — finds a client by name and a case by matter number", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient("Rajesh Kumar Distinctive Name");
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const byName = await request(app).get("/api/search").query({ q: "Rajesh Kumar Distinctive" }).set("Authorization", `Bearer ${token}`);
    expect(byName.status).toBe(200);
    expect(byName.body.clients.some((c: { id: string }) => c.id === client.id)).toBe(true);

    const byMatter = await request(app)
      .get("/api/search")
      .query({ q: testCase.matterNumber })
      .set("Authorization", `Bearer ${token}`);
    expect(byMatter.status).toBe(200);
    expect(byMatter.body.cases.some((c: { id: string }) => c.id === testCase.id)).toBe(true);
  });

  it("scopes case results to the actor's own row-level access — an unrelated Associate never sees another Partner's case", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id });
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");

    const res = await request(app)
      .get("/api/search")
      .query({ q: testCase.matterNumber })
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(0);
  });

  it("requires at least 2 characters and returns empty results otherwise", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/search").query({ q: "a" }).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(0);
  });

  it("GET /api/search/recent — records and returns recent search history for the actor", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    await request(app).get("/api/search").query({ q: "some distinctive query" }).set("Authorization", `Bearer ${token}`);
    const recent = await request(app).get("/api/search/recent").set("Authorization", `Bearer ${token}`);
    expect(recent.status).toBe(200);
    expect(recent.body.some((r: { query: string }) => r.query === "some distinctive query")).toBe(true);
  });
});
