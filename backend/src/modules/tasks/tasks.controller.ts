import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as tasksService from "./tasks.service";

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().min(1),
});

export async function createTask(req: Request, res: Response) {
  const data = parseBody(createTaskSchema, req.body);
  const task = await tasksService.createTask(req.actor!, req.params.caseId, data);
  res.status(201).json(task);
}

export async function listTasksForCase(req: Request, res: Response) {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  const tasks = await tasksService.listTasksForCase(req.actor!, req.params.caseId, page, pageSize);
  res.setHeader("X-Total-Count", String(tasks.total));
  res.setHeader("X-Page", String(tasks.page));
  res.setHeader("X-Page-Size", String(tasks.pageSize));
  res.json(tasks);
}

export async function myTasks(req: Request, res: Response) {
  const tasks = await tasksService.myTasks(req.actor!);
  res.json(tasks);
}

export async function listAllTasks(_req: Request, res: Response) {
  const tasks = await tasksService.listAllTasks();
  res.json(tasks);
}

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().min(1).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE"]).optional(),
});

export async function updateTask(req: Request, res: Response) {
  const data = parseBody(updateTaskSchema, req.body);
  const task = await tasksService.updateTask(req.actor!, req.params.id, data);
  res.json(task);
}

export async function getTaskDetail(req: Request, res: Response) {
  const result = await tasksService.getTaskDetail(req.actor!, req.params.id);
  res.json(result);
}

export async function deleteTask(req: Request, res: Response) {
  await tasksService.deleteTask(req.actor!, req.params.id);
  res.status(204).send();
}

export async function getEmployeeTaskAudit(req: Request, res: Response) {
  const { startDate, endDate, search } = req.query as Record<string, string | undefined>;
  const result = await tasksService.getEmployeeTaskAudit(req.params.userId, { startDate, endDate, search });
  res.json(result);
}
