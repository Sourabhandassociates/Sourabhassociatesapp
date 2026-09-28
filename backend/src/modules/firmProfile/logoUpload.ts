import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";
import { BadRequestError } from "../../utils/errors";
import { logSecurityEvent, requestContext } from "../../utils/securityLogger";

/** PNG only, matching the site's existing logo.png/logo-white.png convention (see
 * `firmProfile.service.ts`'s `updateFirmLogo`) — a single canonical file, no need to
 * support arbitrary image formats. Memory storage (not disk) since the destination
 * is a fixed, well-known path the service writes to directly, not a generated
 * per-upload filename. */
function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".png" || file.mimetype !== "image/png") {
    logSecurityEvent("FILE_UPLOAD_REJECTED", {
      message: `Rejected firm logo upload with disallowed extension/MIME combination (${ext} / ${file.mimetype})`,
      actorId: req.actor?.sub,
      ...requestContext(req),
    });
    cb(new BadRequestError("Logo must be a PNG file."));
    return;
  }
  cb(null, true);
}

// PNG magic-byte signature check — same reasoning as documents/fileValidation.ts's
// detectMimeType: the extension/declared-MIME check above is client-controlled and
// spoofable, so the actual file bytes are verified too before anything is written to
// disk (backend/src/assets/logo.png and frontend/public/logo.png).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function assertPngSignature(buffer: Buffer): void {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new BadRequestError("File content does not match a PNG image — it may have been renamed or is corrupted.");
  }
}

// 2MB cap — a firm logo has no business being larger than this.
export const logoUpload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });
