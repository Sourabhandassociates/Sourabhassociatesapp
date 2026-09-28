import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Request } from "express";
import { env } from "../../config/env";
import { BadRequestError } from "../../utils/errors";
import { logSecurityEvent, requestContext } from "../../utils/securityLogger";

const uploadRoot = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

/**
 * SRD Section 13 — "common formats (PDF, DOCX, images, scans)." This is an allowlist,
 * not a denylist, which is the correct default for uploads: only these extension +
 * declared-MIME-type combinations are accepted at all, so executables, scripts, HTML,
 * etc. are rejected by construction rather than by trying to enumerate everything
 * dangerous. This is the cheap, first-pass check (client-controlled and therefore
 * spoofable); documents/fileValidation.ts verifies the actual file content afterward.
 */
const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_TYPES[ext] !== file.mimetype) {
    logSecurityEvent("FILE_UPLOAD_REJECTED", {
      message: `Rejected upload with disallowed extension/MIME combination (${ext} / ${file.mimetype})`,
      actorId: req.actor?.sub,
      ...requestContext(req),
    });
    cb(new BadRequestError("Unsupported file type. Allowed: PDF, DOC, DOCX, JPG, PNG, TIFF."));
    return;
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString("hex");
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

// 25MB cap for Phase 1 — revisit alongside cloud storage in a later phase.
export const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });
