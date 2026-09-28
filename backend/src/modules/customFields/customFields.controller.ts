import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as customFieldsService from "./customFields.service";

const createSchema = z.object({
  entityType: z.string().min(1),
  label: z.string().min(1),
  fieldType: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN"]),
});

export async function createFieldDefinition(req: Request, res: Response) {
  const data = parseBody(createSchema, req.body);
  const definition = await customFieldsService.createFieldDefinition(req.actor!, data);
  res.status(201).json(definition);
}

export async function listFieldDefinitions(req: Request, res: Response) {
  const definitions = await customFieldsService.listFieldDefinitions(req.query.entityType as string);
  res.json(definitions);
}

export async function deactivateFieldDefinition(req: Request, res: Response) {
  await customFieldsService.deactivateFieldDefinition(req.actor!, req.params.id);
  res.status(204).send();
}

export async function getFieldValuesForCase(req: Request, res: Response) {
  const values = await customFieldsService.getFieldValuesForCase(req.actor!, req.params.caseId);
  res.json(values);
}

const setValuesSchema = z.object({
  values: z.array(z.object({ definitionId: z.string().min(1), value: z.string() })),
});

export async function setFieldValuesForCase(req: Request, res: Response) {
  const data = parseBody(setValuesSchema, req.body);
  const values = await customFieldsService.setFieldValuesForCase(req.actor!, req.params.caseId, data.values);
  res.json(values);
}
