import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as firmProfileController from "./firmProfile.controller";
import { logoUpload } from "./logoUpload";
import { qrCodeUpload } from "./qrCodeUpload";

export const firmProfileRouter = Router();
firmProfileRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
firmProfileRouter.get("/", requirePermission("FIRM_PROFILE.VIEW"), firmProfileController.getFirmProfile);
firmProfileRouter.put("/", requirePermission("FIRM_PROFILE.MANAGE"), firmProfileController.updateFirmProfile);
firmProfileRouter.put(
  "/logo",
  requirePermission("FIRM_PROFILE.MANAGE"),
  logoUpload.single("logo"),
  firmProfileController.updateFirmLogo
);
firmProfileRouter.put(
  "/qr-code",
  requirePermission("FIRM_PROFILE.MANAGE"),
  qrCodeUpload.single("qrCode"),
  firmProfileController.updateFirmQrCode
);
