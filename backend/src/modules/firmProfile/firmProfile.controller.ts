import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { BadRequestError } from "../../utils/errors";
import * as firmProfileService from "./firmProfile.service";
import { assertPngSignature } from "./logoUpload";
import { detectQrImageExtension } from "./qrCodeUpload";

export async function getFirmProfile(_req: Request, res: Response) {
  const profile = await firmProfileService.getFirmProfile();
  res.json(profile);
}

const updateSchema = z.object({
  firmName: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  pan: z.string().optional(),
  website: z.string().optional(),
  bankName: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifsc: z.string().optional(),
  branch: z.string().optional(),
});

export async function updateFirmProfile(req: Request, res: Response) {
  const data = parseBody(updateSchema, req.body);
  const profile = await firmProfileService.updateFirmProfile(req.actor!, data);
  res.json(profile);
}

/** Milestone: invoice-module completion (2026-08-06). `req.file` is populated by
 * `logoUpload` (a dedicated PNG-only multer instance, `firmProfile.routes.ts`) —
 * content already magic-byte-verified there before this ever runs. */
export async function updateFirmLogo(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A logo file is required");
  assertPngSignature(req.file.buffer);
  await firmProfileService.updateFirmLogo(req.actor!, req.file.buffer);
  res.status(204).send();
}

/** Invoice-PDF-refinements pass (2026-08-06). `req.file` is populated by
 * `qrCodeUpload` (`firmProfile.routes.ts`) — extension/MIME already checked there;
 * this re-derives the canonical extension from the actual file bytes (spoof-proof)
 * rather than trusting the client-declared one. */
export async function updateFirmQrCode(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A QR code image is required");
  const ext = detectQrImageExtension(req.file.buffer);
  await firmProfileService.updateFirmQrCode(req.actor!, req.file.buffer, ext);
  res.status(204).send();
}
