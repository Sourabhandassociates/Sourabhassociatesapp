import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { BadRequestError } from "../../utils/errors";
import * as dataImportService from "./dataImport.service";
import { ImportEntityType } from "./dataImport.service";

const ENTITY_TYPES: ImportEntityType[] = ["clients", "contacts", "matters"];

function parseEntityType(value: string): ImportEntityType {
  if (!ENTITY_TYPES.includes(value as ImportEntityType)) {
    throw new BadRequestError(`Unknown import entity type: ${value}`);
  }
  return value as ImportEntityType;
}

export async function downloadTemplate(req: Request, res: Response) {
  const entityType = parseEntityType(req.params.entityType);
  const workbook = dataImportService.generateTemplateWorkbook(entityType);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${entityType}-import-template.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function previewImport(req: Request, res: Response) {
  const entityType = parseEntityType(req.params.entityType);
  if (!req.file) throw new BadRequestError("A .xlsx file is required");
  const rows = await dataImportService.parseAndValidate(entityType, req.file.buffer);
  res.json({ rows });
}

const conflictMatchSchema = z.object({
  type: z.enum(["CLIENT", "CONTACT", "OPPOSITE_PARTY", "OPPOSITE_COUNSEL"]),
  id: z.string(),
  label: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM"]),
});

const commitSchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.number(),
      data: z.record(z.string()),
      errors: z.array(z.string()),
      conflicts: z.array(conflictMatchSchema),
    })
  ),
});

export async function commitImport(req: Request, res: Response) {
  const entityType = parseEntityType(req.params.entityType);
  const { rows } = parseBody(commitSchema, req.body);
  const result = await dataImportService.commitImport(req.actor!, entityType, rows);
  res.json(result);
}
