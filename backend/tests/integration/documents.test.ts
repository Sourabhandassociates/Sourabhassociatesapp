import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, createDocument, tokenForUser } from "../helpers/fixtures";

// A minimal but genuinely valid PDF — just enough for file-type's magic-byte check to
// recognize it as application/pdf, so upload tests exercise the real validation path
// (fileValidation.ts) rather than being coincidentally exempt from it.
const MINIMAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const client = await createClient();
  const testCase = await createCase({
    partnerId: partner.id,
    advocateIds: [associate.id],
    clientIds: [client.id],
  });
  const document = await createDocument(testCase.id, associate.id);

  return {
    case: testCase,
    document,
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
  };
}

describe("Document endpoints are scoped to case access (regression: previously unchecked entirely)", () => {
  it("GET /api/cases/:caseId/documents — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/cases/:caseId/documents — succeeds for the assigned Associate", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /api/cases/:caseId/documents (upload) — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .field("title", "Sneaky Upload")
      .field("category", "Pleadings")
      .attach("file", MINIMAL_PDF, { filename: "test.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:caseId/documents (upload) — succeeds for the assigned Associate with a valid PDF", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "New Filing")
      .field("category", "Pleadings")
      .attach("file", MINIMAL_PDF, { filename: "test.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
  });

  it("GET /api/documents/:id — 404s for an unrelated Associate", async () => {
    const { document, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/documents/${document.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/documents/:id — succeeds for the assigned Associate", async () => {
    const { document, associateToken } = await setup();
    const res = await request(app)
      .get(`/api/documents/${document.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
  });

  it("POST /api/documents/:id/versions — 404s for an unrelated Associate", async () => {
    const { document, outsiderToken } = await setup();
    const res = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .attach("file", MINIMAL_PDF, { filename: "v2.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
  });

  it("POST /api/documents/:id/versions — succeeds for the assigned Associate and increments the version number", async () => {
    const { document, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/documents/${document.id}/versions`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", MINIMAL_PDF, { filename: "v2.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.versionNumber).toBe(2);
  });

  it("GET /api/documents/versions/:versionId/download — 404s for an unrelated Associate (regression: previously any staff member could download any document)", async () => {
    const { document, outsiderToken } = await setup();
    const versionId = document.versions[0].id;
    const res = await request(app)
      .get(`/api/documents/versions/${versionId}/download`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});

describe("File upload validation (MIME/extension allowlist + magic-byte verification)", () => {
  it("rejects a disallowed extension (e.g. an executable)", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "Malicious")
      .field("category", "Pleadings")
      .attach("file", Buffer.from("MZ\x90\x00fake-exe-content"), {
        filename: "invoice.exe",
        contentType: "application/x-msdownload",
      });
    expect(res.status).toBe(400);
  });

  it("rejects a script disguised with an allowed extension but a mismatched declared MIME type", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "Disguised Script")
      .field("category", "Pleadings")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "brief.pdf",
        contentType: "text/html",
      });
    expect(res.status).toBe(400);
  });

  it("rejects content whose actual magic bytes don't match its declared PDF MIME type (spoofing)", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "Spoofed PDF")
      .field("category", "Pleadings")
      // Plain text content, but claims to be a PDF via extension + declared MIME —
      // passes storage.ts's cheap fileFilter, must be caught by magic-byte verification.
      .attach("file", Buffer.from("just plain text, not a real pdf"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
  });

  it("accepts a genuinely valid PDF", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "Genuine Filing")
      .field("category", "Pleadings")
      .attach("file", MINIMAL_PDF, { filename: "genuine.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
  });

  it("rejects a file exceeding the 25MB size limit", async () => {
    const { case: testCase, associateToken } = await setup();
    const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(26 * 1024 * 1024, "a")]);
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/documents`)
      .set("Authorization", `Bearer ${associateToken}`)
      .field("title", "Too Big")
      .field("category", "Pleadings")
      .attach("file", oversized, { filename: "big.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });
});
