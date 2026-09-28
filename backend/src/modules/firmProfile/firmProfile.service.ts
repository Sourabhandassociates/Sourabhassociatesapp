import fs from "fs";
import path from "path";
import { prisma } from "../../config/prisma";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";

/** Milestone 4 (Version 1.0 completion, SRD Section 24 — Firm Profile). Fixed-id
 * singleton row — created lazily on first read/write rather than requiring a seed
 * step, so an existing deployment doesn't need a migration-time data fixture. */
const SINGLETON_ID = "singleton";

const DEFAULT_PROFILE = {
  id: SINGLETON_ID,
  firmName: "Sourabh And Associates",
  address: null,
  phone: null,
  email: null,
  pan: null,
  website: null,
  bankName: null,
  accountHolderName: null,
  accountNumber: null,
  ifsc: null,
  branch: null,
  updatedAt: null,
  updatedById: null,
} as const;

export async function getFirmProfile() {
  const existing = await prisma.firmProfile.findUnique({ where: { id: SINGLETON_ID } });
  const profile = existing ?? DEFAULT_PROFILE;
  return { ...profile, hasQrCode: getFirmQrCodePath() !== null };
}

export interface UpdateFirmProfileInput {
  firmName: string;
  address?: string;
  phone?: string;
  email?: string;
  /** Billing Settings (invoice-module completion, 2026-08-06) — read live by the
   * invoice PDF generator and the Create Invoice preview; see the schema comment
   * on FirmProfile for why these live here rather than per-invoice. */
  pan?: string;
  website?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
}

export async function updateFirmProfile(actor: AccessTokenPayload, input: UpdateFirmProfileInput) {
  const before = (await prisma.firmProfile.findUnique({ where: { id: SINGLETON_ID } })) ?? DEFAULT_PROFILE;
  const profile = await prisma.firmProfile.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...input, updatedById: actor.sub },
    update: { ...input, updatedById: actor.sub },
  });
  const changes = diffObjects(before, profile, Object.keys(input));
  if (changes) {
    await recordAuditLog(actor, "FIRM_PROFILE_UPDATED", "FirmProfile", SINGLETON_ID, {
      entityName: input.firmName,
      changes,
    });
  }
  return profile;
}

/** Single canonical logo file, not a DB-stored path — matches the Branding pass's
 * existing convention (`frontend/public/logo.png` for the web UI,
 * `backend/src/assets/logo.png` for PDF exports) rather than introducing a second
 * source of truth. Uploading a new logo overwrites both locations atomically
 * (write-to-temp-then-rename), so every PDF/screen picks it up immediately with no
 * further configuration. */
const BACKEND_LOGO_PATH = path.join(__dirname, "..", "..", "assets", "logo.png");
const FRONTEND_LOGO_PATH = path.join(__dirname, "..", "..", "..", "..", "frontend", "public", "logo.png");

export async function updateFirmLogo(actor: AccessTokenPayload, buffer: Buffer): Promise<void> {
  for (const dest of [BACKEND_LOGO_PATH, FRONTEND_LOGO_PATH]) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);
  }
  await recordAuditLog(actor, "FIRM_LOGO_UPDATED", "FirmProfile", SINGLETON_ID, { details: "Logo replaced" });
}

/** Payment QR code (invoice-PDF-refinements pass, 2026-08-06) — same canonical
 * two-location-file convention as the logo above, except the extension varies
 * (PNG or JPG, whichever the firm's bank/UPI app exported) rather than being fixed.
 * Since only one QR code is ever "current," uploading one format deletes any
 * leftover file in the other format at both locations, so a stale image from a
 * previous upload can never be picked up by mistake. */
const QR_CODE_BASENAME = "payment-qr";
const BACKEND_ASSETS_DIR = path.join(__dirname, "..", "..", "assets");
const FRONTEND_PUBLIC_DIR = path.join(__dirname, "..", "..", "..", "..", "frontend", "public");
const QR_CODE_EXTENSIONS = ["png", "jpg"] as const;

export async function updateFirmQrCode(actor: AccessTokenPayload, buffer: Buffer, ext: "png" | "jpg"): Promise<void> {
  const staleExt = ext === "png" ? "jpg" : "png";
  for (const dir of [BACKEND_ASSETS_DIR, FRONTEND_PUBLIC_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${QR_CODE_BASENAME}.${ext}`);
    const tmp = `${dest}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);
    const stalePath = path.join(dir, `${QR_CODE_BASENAME}.${staleExt}`);
    if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
  }
  await recordAuditLog(actor, "FIRM_QR_CODE_UPDATED", "FirmProfile", SINGLETON_ID, { details: "Payment QR code replaced" });
}

/** Used by the invoice PDF generator to find the current QR code, if any — the PDF
 * hides the "Scan to Pay" section entirely when this returns null (no upload yet). */
export function getFirmQrCodePath(): string | null {
  for (const ext of QR_CODE_EXTENSIONS) {
    const p = path.join(BACKEND_ASSETS_DIR, `${QR_CODE_BASENAME}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
