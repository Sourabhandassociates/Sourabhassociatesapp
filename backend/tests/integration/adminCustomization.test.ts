import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

// The firm logo lives at two fixed, git-tracked project paths (see
// firmProfile.service.ts's updateFirmLogo) rather than a generated per-upload
// filename — a real upload test must back these up and restore them afterward so
// the test suite never leaves the actual branding asset overwritten with test data.
const BACKEND_LOGO_PATH = path.join(__dirname, "..", "..", "src", "assets", "logo.png");
const FRONTEND_LOGO_PATH = path.join(__dirname, "..", "..", "..", "frontend", "public", "logo.png");

// Same reasoning as the logo paths above — the payment QR code (invoice-PDF-
// refinements pass, 2026-08-06) lives at two fixed, git-tracked locations too,
// except the extension varies (PNG or JPG); back up and restore both possible
// extensions at both locations.
const QR_PATHS = {
  backendPng: path.join(__dirname, "..", "..", "src", "assets", "payment-qr.png"),
  backendJpg: path.join(__dirname, "..", "..", "src", "assets", "payment-qr.jpg"),
  frontendPng: path.join(__dirname, "..", "..", "..", "frontend", "public", "payment-qr.png"),
  frontendJpg: path.join(__dirname, "..", "..", "..", "frontend", "public", "payment-qr.jpg"),
};

function backupQrFiles(): Partial<Record<keyof typeof QR_PATHS, Buffer>> {
  const backup: Partial<Record<keyof typeof QR_PATHS, Buffer>> = {};
  for (const key of Object.keys(QR_PATHS) as (keyof typeof QR_PATHS)[]) {
    if (fs.existsSync(QR_PATHS[key])) backup[key] = fs.readFileSync(QR_PATHS[key]);
  }
  return backup;
}

function restoreQrFiles(backup: Partial<Record<keyof typeof QR_PATHS, Buffer>>): void {
  for (const key of Object.keys(QR_PATHS) as (keyof typeof QR_PATHS)[]) {
    if (backup[key]) {
      fs.writeFileSync(QR_PATHS[key], backup[key]!);
    } else if (fs.existsSync(QR_PATHS[key])) {
      fs.unlinkSync(QR_PATHS[key]);
    }
  }
}

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const ONE_PIXEL_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64"
);

describe("Firm Profile (Milestone 4, SRD Section 24)", () => {
  it("returns the default singleton profile to any authenticated staff role", async () => {
    const staff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(staff.id, "OFFICE_STAFF");
    const res = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.firmName).toBe("Sourabh And Associates");
  });

  it("lets the Managing Partner update the profile, and the change is visible on the next read", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const putRes = await request(app)
      .put("/api/firm-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ firmName: "S&A Legal LLP", address: "New Delhi", pan: "AAAAA0000A" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.firmName).toBe("S&A Legal LLP");

    const getRes = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
    expect(getRes.body.firmName).toBe("S&A Legal LLP");
    expect(getRes.body.pan).toBe("AAAAA0000A");
  });

  it("no longer accepts GSTIN, SWIFT, or UPI ID via the update API (Announcements/Firm Profile simplification, 2026-08-13) — the schema columns are untouched, but submitted values are silently dropped rather than persisted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const putRes = await request(app)
      .put("/api/firm-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ firmName: "S&A Legal LLP", gstin: "07AAAAA0000A1Z5", swift: "HDFCINBB", upiId: "salegal@hdfcbank" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.gstin ?? null).toBeNull();
    expect(putRes.body.swift ?? null).toBeNull();
    expect(putRes.body.upiId ?? null).toBeNull();

    const getRes = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
    expect(getRes.body.gstin ?? null).toBeNull();
    expect(getRes.body.swift ?? null).toBeNull();
    expect(getRes.body.upiId ?? null).toBeNull();
  });

  it("rejects a non-Managing-Partner attempting to update the profile", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .put("/api/firm-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ firmName: "Hijacked Name" });
    expect(res.status).toBe(403);
  });

  it("persists Billing & Payment Settings (bank details) that invoices read live (invoice-module completion, 2026-08-06)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const putRes = await request(app)
      .put("/api/firm-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        firmName: "S&A Legal LLP",
        bankName: "HDFC Bank",
        accountHolderName: "S&A Legal LLP",
        accountNumber: "123456789012",
        ifsc: "HDFC0001234",
        branch: "Connaught Place",
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.bankName).toBe("HDFC Bank");

    const getRes = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
    expect(getRes.body.accountNumber).toBe("123456789012");
    expect(getRes.body.ifsc).toBe("HDFC0001234");
  });

  it("lets the Managing Partner upload a PNG logo, and rejects a non-PNG upload", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );

    const backendBackup = fs.existsSync(BACKEND_LOGO_PATH) ? fs.readFileSync(BACKEND_LOGO_PATH) : null;
    const frontendBackup = fs.existsSync(FRONTEND_LOGO_PATH) ? fs.readFileSync(FRONTEND_LOGO_PATH) : null;
    try {
      const goodUpload = await request(app)
        .put("/api/firm-profile/logo")
        .set("Authorization", `Bearer ${token}`)
        .attach("logo", onePixelPng, { filename: "logo.png", contentType: "image/png" });
      expect(goodUpload.status).toBe(204);
      expect(fs.readFileSync(BACKEND_LOGO_PATH).equals(onePixelPng)).toBe(true);
    } finally {
      if (backendBackup) fs.writeFileSync(BACKEND_LOGO_PATH, backendBackup);
      if (frontendBackup) fs.writeFileSync(FRONTEND_LOGO_PATH, frontendBackup);
    }

    const notActuallyPng = await request(app)
      .put("/api/firm-profile/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", Buffer.from("not a png"), { filename: "logo.png", contentType: "image/png" });
    expect(notActuallyPng.status).toBe(400);

    const wrongExtension = await request(app)
      .put("/api/firm-profile/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", onePixelPng, { filename: "logo.jpg", contentType: "image/jpeg" });
    expect(wrongExtension.status).toBe(400);
  });

  it("rejects a non-Managing-Partner uploading the firm logo", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const res = await request(app)
      .put("/api/firm-profile/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", onePixelPng, { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  it("reports hasQrCode: false until a payment QR code is uploaded, then true", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const backup = backupQrFiles();
    try {
      restoreQrFiles({});
      const before = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
      expect(before.body.hasQrCode).toBe(false);

      const upload = await request(app)
        .put("/api/firm-profile/qr-code")
        .set("Authorization", `Bearer ${token}`)
        .attach("qrCode", ONE_PIXEL_PNG, { filename: "qr.png", contentType: "image/png" });
      expect(upload.status).toBe(204);

      const after = await request(app).get("/api/firm-profile").set("Authorization", `Bearer ${token}`);
      expect(after.body.hasQrCode).toBe(true);
    } finally {
      restoreQrFiles(backup);
    }
  });

  it("uploading a JPG QR code after a PNG one removes the stale PNG, so exactly one file is ever current", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const backup = backupQrFiles();
    try {
      restoreQrFiles({});
      const pngUpload = await request(app)
        .put("/api/firm-profile/qr-code")
        .set("Authorization", `Bearer ${token}`)
        .attach("qrCode", ONE_PIXEL_PNG, { filename: "qr.png", contentType: "image/png" });
      expect(pngUpload.status).toBe(204);
      expect(fs.existsSync(QR_PATHS.backendPng)).toBe(true);

      const jpgUpload = await request(app)
        .put("/api/firm-profile/qr-code")
        .set("Authorization", `Bearer ${token}`)
        .attach("qrCode", ONE_PIXEL_JPEG, { filename: "qr.jpg", contentType: "image/jpeg" });
      expect(jpgUpload.status).toBe(204);
      expect(fs.existsSync(QR_PATHS.backendJpg)).toBe(true);
      expect(fs.existsSync(QR_PATHS.backendPng)).toBe(false);
      expect(fs.existsSync(QR_PATHS.frontendJpg)).toBe(true);
      expect(fs.existsSync(QR_PATHS.frontendPng)).toBe(false);
    } finally {
      restoreQrFiles(backup);
    }
  });

  it("rejects a QR code upload whose content doesn't match a PNG or JPG image", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .put("/api/firm-profile/qr-code")
      .set("Authorization", `Bearer ${token}`)
      .attach("qrCode", Buffer.from("not an image"), { filename: "qr.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-Managing-Partner uploading the payment QR code", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .put("/api/firm-profile/qr-code")
      .set("Authorization", `Bearer ${token}`)
      .attach("qrCode", ONE_PIXEL_PNG, { filename: "qr.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });
});

describe("Announcements (Milestone 4, SRD Section 8/24)", () => {
  it("publishes a Managing Partner announcement immediately (isActive: true)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Office closed Friday", body: "For Diwali." });
    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(true);
  });

  it("forces an Office Staff announcement into draft state regardless of intent (service-layer enforcement)", async () => {
    const officeStaff = await createUser("OFFICE_STAFF");
    const token = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const res = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Reminder", body: "Submit timesheets.", isActive: true });
    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(false);
  });

  it("rejects an Associate from creating an announcement (no ANNOUNCEMENTS.CREATE by default)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Should fail", body: "..." });
    expect(res.status).toBe(403);
  });

  it("hides an Office Staff draft from a non-Managing-Partner viewer, but shows it to the Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ title: "Draft item", body: "..." });

    const associateList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${associateToken}`);
    expect(associateList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(false);

    const partnerList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${partnerToken}`);
    expect(partnerList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(true);
  });

  it("lets the Managing Partner publish an Office Staff draft, and rejects Office Staff from doing it themselves", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ title: "Needs approval", body: "..." });

    const selfPublish = await request(app)
      .patch(`/api/announcements/${created.body.id}/active`)
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ isActive: true });
    expect(selfPublish.status).toBe(403);

    const mpPublish = await request(app)
      .patch(`/api/announcements/${created.body.id}/active`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ isActive: true });
    expect(mpPublish.status).toBe(200);
    expect(mpPublish.body.isActive).toBe(true);
  });
});

describe("Custom Fields (Milestone 4, SRD Section 24, Case entity only)", () => {
  it("lets the Managing Partner define a custom field for Case, and rejects an unsupported entity type", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const ok = await request(app)
      .post("/api/custom-fields/definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({ entityType: "CASE", label: "Insurance Policy No.", fieldType: "TEXT" });
    expect(ok.status).toBe(201);

    const bad = await request(app)
      .post("/api/custom-fields/definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({ entityType: "CLIENT", label: "Not Supported Yet", fieldType: "TEXT" });
    expect(bad.status).toBe(400);
  });

  it("rejects an Associate from defining a custom field (no CUSTOM_FIELDS.MANAGE by default)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post("/api/custom-fields/definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({ entityType: "CASE", label: "Should fail", fieldType: "TEXT" });
    expect(res.status).toBe(403);
  });

  it("lets any staff member with case access read and write a case's custom field values, merged with the definition list", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const def = await request(app)
      .post("/api/custom-fields/definitions")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ entityType: "CASE", label: "Policy No.", fieldType: "TEXT" });

    const emptyValues = await request(app)
      .get(`/api/custom-fields/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(emptyValues.status).toBe(200);
    expect(emptyValues.body.find((v: { definitionId: string }) => v.definitionId === def.body.id).value).toBeNull();

    const setRes = await request(app)
      .put(`/api/custom-fields/cases/${testCase.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ values: [{ definitionId: def.body.id, value: "POL-12345" }] });
    expect(setRes.status).toBe(200);
    expect(setRes.body.find((v: { definitionId: string }) => v.definitionId === def.body.id).value).toBe("POL-12345");
  });

  it("excludes a deactivated field definition from subsequent listings", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const def = await request(app)
      .post("/api/custom-fields/definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({ entityType: "CASE", label: "Temp Field", fieldType: "TEXT" });

    const del = await request(app)
      .delete(`/api/custom-fields/definitions/${def.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app)
      .get("/api/custom-fields/definitions?entityType=CASE")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.some((d: { id: string }) => d.id === def.body.id)).toBe(false);
  });
});

describe("Audit Log Viewer (Milestone 4, SRD Section 24/29)", () => {
  it("lets the Managing Partner (AUDIT_LOG.VIEW_ALL) see entries created by other users", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Draft reply", priority: "MEDIUM", assignedToId: associate.id });

    const res = await request(app).get("/api/audit-log").set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e: { userId: string }) => e.userId === associate.id)).toBe(true);
  });

  it("scopes Accounts Team (AUDIT_LOG.VIEW_OWN) to only their own entries", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const accounts = await createUser("ACCOUNTS_TEAM");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const accountsToken = await tokenForUser(accounts.id, "ACCOUNTS_TEAM");

    await request(app)
      .put("/api/firm-profile")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ firmName: "Some Update By Partner" });

    const res = await request(app).get("/api/audit-log").set("Authorization", `Bearer ${accountsToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.every((e: { userId: string }) => e.userId === accounts.id)).toBe(true);
  });

  it("rejects an Associate (neither VIEW_ALL nor VIEW_OWN by default)", async () => {
    const associate = await createUser("ASSOCIATE");
    const token = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app).get("/api/audit-log").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
