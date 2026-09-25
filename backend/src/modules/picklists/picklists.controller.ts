import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as picklistsService from "./picklists.service";

export async function listValues(req: Request, res: Response) {
  const values = await picklistsService.listValues(req.params.category);
  res.json(values);
}

const addValueSchema = z.object({ value: z.string().min(1) });

export async function addValue(req: Request, res: Response) {
  const data = parseBody(addValueSchema, req.body);
  const value = await picklistsService.addValue(req.actor!, req.params.category, data.value);
  res.status(201).json(value);
}

const updateValueSchema = z.object({
  value: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function updateValue(req: Request, res: Response) {
  const data = parseBody(updateValueSchema, req.body);
  const value = await picklistsService.updateValue(req.actor!, req.params.id, data);
  res.json(value);
}
