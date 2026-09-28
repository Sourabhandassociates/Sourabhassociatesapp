import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as casesService from "./cases.service";

/**
 * New Case form simplification (2026-08-11) — `title`/`practiceArea`/`partnerId`
 * were previously mandatory; the simplified New Case screen collects only
 * title/case-no./case-type/court-no./court-complex plus Client/Client Role, all
 * optional except Client (unchanged, see `clients` below). `partnerId` is now
 * optional here too — `casesService.createCase` auto-assigns it server-side
 * when omitted. `courtNumber` ("Court No.") is new.
 */
const createCaseSchema = z.object({
  title: z.string().optional(),
  practiceArea: z.string().optional(),
  courtCaseNumber: z.string().optional(),
  courtName: z.string().optional(),
  courtNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
  filingDate: z.string().datetime().optional(),
  partnerId: z.string().min(1).optional(),
  advocateIds: z.array(z.string()).default([]),
  // Unchanged — Client selection remains mandatory, the one existing business
  // rule the New Case form simplification explicitly carries forward as-is.
  clients: z.array(z.object({ clientId: z.string().min(1), partyRole: z.string().min(1) })).min(1),
  // Step 1 revision (Managing Partner review, items 4/5/8):
  stage: z.string().optional(),
  description: z.string().optional(),
  caseType: z.string().optional(),
  oppositeCounsel: z.string().optional(),
  oppositeParty: z.string().optional(),
  department: z.string().optional(),
});

export async function createCase(req: Request, res: Response) {
  const data = parseBody(createCaseSchema, req.body);
  const created = await casesService.createCase(req.actor!, data);
  res.status(201).json(created);
}

export async function listCases(req: Request, res: Response) {
  const { status, practiceArea, search, tag, page, pageSize } = req.query as Record<string, string | undefined>;
  const cases = await casesService.listCases(req.actor!, {
    status,
    practiceArea,
    search,
    tag,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  // Milestone 4 (Version 1.0 completion) — pagination metadata in headers, not the
  // body, so the JSON response stays a plain array for every existing consumer.
  res.setHeader("X-Total-Count", String(cases.total));
  res.setHeader("X-Page", String(cases.page));
  res.setHeader("X-Page-Size", String(cases.pageSize));
  res.json(cases);
}

export async function getCase(req: Request, res: Response) {
  const caseRecord = await casesService.getCase(req.actor!, req.params.id);
  res.json(caseRecord);
}

/** Case Section Access (2026-08-17) — mirrors GET /accounts/permissions' shape:
 * no permission gate, since every staff actor (including one who holds none of
 * the eight flags) must still be able to fetch a {overview:false, ...} response
 * rather than being 403'd off the endpoint that tells the frontend what to hide. */
export async function getSectionPermissions(req: Request, res: Response) {
  res.json(casesService.caseSectionPermissionFlags(req.actor!));
}

const updateCaseSchema = z.object({
  title: z.string().min(1).optional(),
  practiceArea: z.string().min(1).optional(),
  courtCaseNumber: z.string().optional(),
  courtName: z.string().optional(),
  courtNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
  filingDate: z.string().datetime().optional(),
  stage: z.string().optional(),
  description: z.string().optional(),
  caseType: z.string().optional(),
  oppositeCounsel: z.string().optional(),
  oppositeParty: z.string().optional(),
  department: z.string().optional(),
});

export async function updateCase(req: Request, res: Response) {
  const data = parseBody(updateCaseSchema, req.body);
  const updated = await casesService.updateCase(req.actor!, req.params.id, data);
  res.json(updated);
}

const statusSchema = z.object({ status: z.enum(["INTAKE", "ACTIVE", "ON_HOLD", "CLOSED", "ARCHIVED"]) });

export async function setCaseStatus(req: Request, res: Response) {
  const data = parseBody(statusSchema, req.body);
  const updated = await casesService.setCaseStatus(req.actor!, req.params.id, data.status);
  res.json(updated);
}

const advocateSchema = z.object({ userId: z.string().min(1) });

export async function addAdvocate(req: Request, res: Response) {
  const data = parseBody(advocateSchema, req.body);
  await casesService.addAdvocate(req.actor!, req.params.id, data.userId);
  res.status(201).json({ ok: true });
}

export async function removeAdvocate(req: Request, res: Response) {
  await casesService.removeAdvocate(req.actor!, req.params.id, req.params.userId);
  res.status(204).send();
}

export async function deleteCase(req: Request, res: Response) {
  await casesService.deleteCase(req.actor!, req.params.id);
  res.status(204).send();
}

const tagSchema = z.object({ tag: z.string().min(1) });

export async function addTag(req: Request, res: Response) {
  const data = parseBody(tagSchema, req.body);
  const link = await casesService.addTag(req.actor!, req.params.id, data.tag);
  res.status(201).json(link);
}

export async function removeTag(req: Request, res: Response) {
  await casesService.removeTag(req.actor!, req.params.id, req.params.tag);
  res.status(204).send();
}

const reassignSchema = z.object({ partnerId: z.string().min(1) });

export async function reassignPartner(req: Request, res: Response) {
  const data = parseBody(reassignSchema, req.body);
  const updated = await casesService.reassignPartner(req.actor!, req.params.id, data.partnerId);
  res.json(updated);
}

/** Facts & Arguments case sections (2026-08-18). `content` accepts an empty
 * string deliberately (clearing the section back to its empty state is a
 * valid save, not a validation error). */
const richTextContentSchema = z.object({ content: z.string() });

export async function getFacts(req: Request, res: Response) {
  res.json(await casesService.getFacts(req.actor!, req.params.id));
}

export async function updateFacts(req: Request, res: Response) {
  const data = parseBody(richTextContentSchema, req.body);
  res.json(await casesService.updateFacts(req.actor!, req.params.id, data.content));
}

export async function getArguments(req: Request, res: Response) {
  res.json(await casesService.getArguments(req.actor!, req.params.id));
}

export async function updateArguments(req: Request, res: Response) {
  const data = parseBody(richTextContentSchema, req.body);
  res.json(await casesService.updateArguments(req.actor!, req.params.id, data.content));
}
