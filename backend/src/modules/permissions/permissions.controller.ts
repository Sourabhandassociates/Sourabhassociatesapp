import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as permissionsService from "./permissions.service";

export async function getCatalogue(_req: Request, res: Response) {
  const catalogue = await permissionsService.getCatalogue();
  res.json(catalogue);
}

export async function getRoleDefaults(_req: Request, res: Response) {
  const defaults = await permissionsService.getRoleDefaults();
  res.json(defaults);
}

const roleSchema = z.enum(["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE", "OFFICE_STAFF", "ACCOUNTS_TEAM"]);

const updateRoleDefaultsSchema = z.object({
  changes: z
    .array(z.object({ role: roleSchema, permissionKey: z.string().min(1), granted: z.boolean() }))
    .min(1),
});

export async function updateRoleDefaults(req: Request, res: Response) {
  const data = parseBody(updateRoleDefaultsSchema, req.body);
  const result = await permissionsService.updateRoleDefaults(req.actor!, data.changes);
  res.json(result);
}

export async function getEmployeePermissionSummary(req: Request, res: Response) {
  const summary = await permissionsService.getEmployeePermissionSummary(req.params.userId);
  res.json(summary);
}

const createOverrideSchema = z.object({
  permissionKey: z.string().min(1),
  effect: z.enum(["GRANT", "REVOKE"]),
  reason: z.string().min(1),
});

export async function createOverride(req: Request, res: Response) {
  const data = parseBody(createOverrideSchema, req.body);
  const override = await permissionsService.createOverride(req.actor!, req.params.userId, data);
  res.status(201).json(override);
}

export async function removeOverride(req: Request, res: Response) {
  await permissionsService.removeOverride(req.actor!, req.params.userId, req.params.permissionKey);
  res.status(204).send();
}

export async function resetEmployeeToRoleDefaults(req: Request, res: Response) {
  const result = await permissionsService.resetEmployeeToRoleDefaults(req.actor!, req.params.userId);
  res.json(result);
}
