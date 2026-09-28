import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions } from "../../middleware/permissions";
import * as auditLogController from "./auditLog.controller";

export const auditLogRouter = Router();
auditLogRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
auditLogRouter.get("/", auditLogController.listAuditLog);
