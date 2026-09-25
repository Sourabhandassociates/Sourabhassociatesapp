import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as clientsService from "./clients.service";

/**
 * Client-module optional-fields pass (2026-08-06) — only `name` is mandatory to
 * create a client; Type/Email/Phone/Address may all be added later via edit. Email
 * still has to look like an email *if supplied* — `z.union` with the empty-string
 * literal lets a blank field through without tripping the `.email()` format check
 * (plain `.optional()` alone only skips validation when the key is absent, not when
 * it's present-but-blank, which is what an untouched form input actually sends).
 */
const optionalEmail = z.union([z.string().email(), z.literal("")]).optional();

const createClientSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  email: optionalEmail,
  phone: z.string().optional(),
  address: z.string().optional(),
  conflictAcknowledged: z.boolean().optional(),
  conflictReason: z.string().optional(),
});

export async function createClient(req: Request, res: Response) {
  const data = parseBody(createClientSchema, req.body);
  const result = await clientsService.createClient(req.actor!, data);
  res.status(201).json(result);
}

export async function listClients(req: Request, res: Response) {
  const search = (req.query.search as string) ?? "";
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  const clients = await clientsService.listClients(req.actor!, search, page, pageSize);
  res.setHeader("X-Total-Count", String(clients.total));
  res.setHeader("X-Page", String(clients.page));
  res.setHeader("X-Page-Size", String(clients.pageSize));
  res.json(clients);
}

export async function getClient(req: Request, res: Response) {
  const client = await clientsService.getClient(req.actor!, req.params.id);
  res.json(client);
}

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  email: optionalEmail,
  phone: z.string().optional(),
  address: z.string().optional(),
});

export async function updateClient(req: Request, res: Response) {
  const data = parseBody(updateClientSchema, req.body);
  const client = await clientsService.updateClient(req.actor!, req.params.id, data);
  res.json(client);
}

const statusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]) });

export async function setClientStatus(req: Request, res: Response) {
  const data = parseBody(statusSchema, req.body);
  const result = await clientsService.setClientStatus(req.actor!, req.params.id, data.status);
  res.json(result);
}

export async function deleteClient(req: Request, res: Response) {
  await clientsService.deleteClient(req.actor!, req.params.id);
  res.status(204).send();
}

/** Client Portal Permissions (2026-08-14). Every field optional so the frontend can
 * flip a single toggle at a time (each fires its own PATCH), but at least one must
 * be present — an empty PATCH is a client error, not a silent no-op. */
const portalPermissionsSchema = z
  .object({
    portalCasesEnabled: z.boolean().optional(),
    portalHearingHistoryEnabled: z.boolean().optional(),
    portalDocumentsEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one permission must be provided" });

export async function updatePortalPermissions(req: Request, res: Response) {
  const data = parseBody(portalPermissionsSchema, req.body);
  const client = await clientsService.updatePortalPermissions(req.actor!, req.params.id, data);
  res.json(client);
}
