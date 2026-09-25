import { describe, it, expect } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, tokenForUser } from "../helpers/fixtures";

async function buildXlsx(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("sheet");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("Data Import & Export (Milestone 3, SRD Section 25)", () => {
  it("rejects a role without DATA_IMPORT.RUN (Associate)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app).get("/api/data-import/clients/template").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("GET template — Managing Partner receives an xlsx workbook", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/data-import/clients/template").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
  });

  it("preview -> commit — a valid Clients row is created; a row missing a required field is blocked", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const buffer = await buildXlsx(
      ["Name", "Type", "Email", "Phone", "Address"],
      [
        ["Bulk Import Client One", "INDIVIDUAL", "bulk.one@test.local", "9999999999", ""],
        ["", "INDIVIDUAL", "", "", ""], // missing required Name
      ]
    );

    const preview = await request(app)
      .post("/api/data-import/clients/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buffer, "clients.xlsx");
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(2);
    expect(preview.body.rows[0].errors).toHaveLength(0);
    expect(preview.body.rows[1].errors.length).toBeGreaterThan(0);

    const commit = await request(app)
      .post("/api/data-import/clients/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: preview.body.rows });
    expect(commit.status).toBe(200);
    expect(commit.body.createdCount).toBe(1);
    expect(commit.body.skipped).toHaveLength(1);

    const created = await prisma.client.findUnique({ where: { email: "bulk.one@test.local" } });
    expect(created).not.toBeNull();
  });

  it("Client-module optional-fields pass (2026-08-06) — a Clients row with a blank Type is not blocked", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const buffer = await buildXlsx(
      ["Name", "Type", "Email", "Phone", "Address"],
      [["No Type Bulk Client", "", "", "", ""]]
    );

    const preview = await request(app)
      .post("/api/data-import/clients/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buffer, "clients.xlsx");
    expect(preview.status).toBe(200);
    expect(preview.body.rows[0].errors).toHaveLength(0);

    const commit = await request(app)
      .post("/api/data-import/clients/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: preview.body.rows });
    expect(commit.status).toBe(200);
    expect(commit.body.createdCount).toBe(1);

    const created = await prisma.client.findFirst({ where: { name: "No Type Bulk Client" } });
    expect(created?.type).toBeNull();
  });

  it("skips a row with a possible conflict-check match rather than auto-creating it", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    // Seed an existing client whose name will fuzzy-match the imported row.
    await prisma.client.create({
      data: {
        name: "Conflict Prone Name",
        type: "INDIVIDUAL",
        clientId: "SA-CLI-TEST-0001",
        passwordHash: "unused",
      },
    });

    const buffer = await buildXlsx(["Name", "Type", "Email", "Phone", "Address"], [["Conflict Prone Name", "INDIVIDUAL", "", "", ""]]);

    const preview = await request(app)
      .post("/api/data-import/clients/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", buffer, "clients.xlsx");
    expect(preview.status).toBe(200);
    expect(preview.body.rows[0].conflicts.length).toBeGreaterThan(0);

    const commit = await request(app)
      .post("/api/data-import/clients/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: preview.body.rows });
    expect(commit.body.createdCount).toBe(0);
    expect(commit.body.skipped).toHaveLength(1);
  });
});
