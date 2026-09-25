import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";
import { BadRequestError } from "../../utils/errors";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".xlsx" || file.mimetype !== XLSX_MIME) {
    cb(new BadRequestError("Only .xlsx files are accepted for bulk import"));
    return;
  }
  cb(null, true);
}

/** In-memory only — the parsed rows never need to persist as a file on disk, only
 * transiently while parsing/validating (dataImport.service.ts). 5MB is generous for a
 * spreadsheet of a few thousand rows. */
export const importUpload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
