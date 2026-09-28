import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as contactsService from "./contacts.service";

const createContactSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  organization: z.string().optional(),
  designation: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  conflictAcknowledged: z.boolean().optional(),
  conflictReason: z.string().optional(),
});

export async function createContact(req: Request, res: Response) {
  const data = parseBody(createContactSchema, req.body);
  const contact = await contactsService.createContact(req.actor!, data);
  res.status(201).json(contact);
}

export async function listContacts(req: Request, res: Response) {
  const search = (req.query.search as string) ?? "";
  const category = req.query.category as string | undefined;
  const contacts = await contactsService.listContacts(search, category);
  res.json(contacts);
}

export async function listClientDirectory(req: Request, res: Response) {
  const search = req.query.search as string | undefined;
  const rows = await contactsService.listClientDirectory(search);
  res.json(rows);
}

export async function getContact(req: Request, res: Response) {
  const contact = await contactsService.getContact(req.params.id);
  res.json(contact);
}

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  organization: z.string().optional(),
  designation: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateContact(req: Request, res: Response) {
  const data = parseBody(updateContactSchema, req.body);
  const contact = await contactsService.updateContact(req.actor!, req.params.id, data);
  res.json(contact);
}

export async function deleteContact(req: Request, res: Response) {
  await contactsService.deleteContact(req.actor!, req.params.id);
  res.status(204).send();
}

const linkMatterSchema = z.object({ caseId: z.string().min(1) });

export async function linkMatter(req: Request, res: Response) {
  const data = parseBody(linkMatterSchema, req.body);
  const link = await contactsService.linkMatter(req.actor!, req.params.id, data.caseId);
  res.status(201).json(link);
}

export async function unlinkMatter(req: Request, res: Response) {
  await contactsService.unlinkMatter(req.actor!, req.params.id, req.params.caseId);
  res.status(204).send();
}
