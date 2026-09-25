import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";
import { BadRequestError } from "../../utils/errors";
import { logSecurityEvent, requestContext } from "../../utils/securityLogger";

/** Payment QR code (invoice-PDF-refinements pass, 2026-08-06) — unlike the firm
 * logo (PNG only), a QR code is commonly exported as either PNG or JPG by UPI
 * apps/banks, so both are accepted here. Memory storage since the destination is a
 * fixed, well-known path pair the service writes to directly. */
const ALLOWED_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_TYPES[ext] !== file.mimetype) {
    logSecurityEvent("FILE_UPLOAD_REJECTED", {
      message: `Rejected payment QR code upload with disallowed extension/MIME combination (${ext} / ${file.mimetype})`,
      actorId: req.actor?.sub,
      ...requestContext(req),
    });
    cb(new BadRequestError("QR code must be a PNG or JPG image."));
    return;
  }
  cb(null, true);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/** Same "don't trust the client-declared MIME type" reasoning as logoUpload.ts's
 * assertPngSignature — verifies the actual file bytes, not just the extension/MIME
 * the client claims, before anything is written to disk. Returns the canonical
 * extension to save under, derived from the real content rather than the
 * (spoofable) original filename. */
export function detectQrImageExtension(buffer: Buffer): "png" | "jpg" {
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) return "jpg";
  throw new BadRequestError("File content does not match a PNG or JPG image — it may have been renamed or is corrupted.");
}

// 2MB cap — a QR code image has no business being larger than this.
export const qrCodeUpload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });
