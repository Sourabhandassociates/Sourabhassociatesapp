import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as timeLogsService from "./timeLogs.service";

const createSchema = z.object({
  taskId: z.string().optional(),
  date: z.string().datetime(),
  hours: z.number().positive(),
  billable: z.boolean().optional(),
  description: z.string().optional(),
});

export async function createTimeLog(req: Request, res: Response) {
  const data = parseBody(createSchema, req.body);
  const timeLog = await timeLogsService.createTimeLog(req.actor!, req.params.caseId, data);
  res.status(201).json(timeLog);
}

export async function listTimeLogs(req: Request, res: Response) {
  const timeLogs = await timeLogsService.listTimeLogs(req.actor!, req.params.caseId);
  res.json(timeLogs);
}

const updateSchema = z.object({
  date: z.string().datetime().optional(),
  hours: z.number().positive().optional(),
  billable: z.boolean().optional(),
  description: z.string().optional(),
});

export async function updateTimeLog(req: Request, res: Response) {
  const data = parseBody(updateSchema, req.body);
  const timeLog = await timeLogsService.updateTimeLog(req.actor!, req.params.id, data);
  res.json(timeLog);
}

export async function deleteTimeLog(req: Request, res: Response) {
  await timeLogsService.deleteTimeLog(req.actor!, req.params.id);
  res.status(204).send();
}
