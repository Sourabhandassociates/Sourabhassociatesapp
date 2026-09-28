import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as expensesService from "./expenses.service";

const createSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  date: z.string().datetime(),
  receiptReference: z.string().optional(),
  billableToClient: z.boolean().optional(),
});

export async function createExpense(req: Request, res: Response) {
  const data = parseBody(createSchema, req.body);
  const expense = await expensesService.createExpense(req.actor!, req.params.caseId, data);
  res.status(201).json(expense);
}

export async function listExpenses(req: Request, res: Response) {
  const expenses = await expensesService.listExpenses(req.actor!, req.params.caseId);
  res.json(expenses);
}

const updateSchema = z.object({
  category: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  date: z.string().datetime().optional(),
  receiptReference: z.string().optional(),
  billableToClient: z.boolean().optional(),
});

export async function updateExpense(req: Request, res: Response) {
  const data = parseBody(updateSchema, req.body);
  const expense = await expensesService.updateExpense(req.actor!, req.params.id, data);
  res.json(expense);
}

export async function deleteExpense(req: Request, res: Response) {
  await expensesService.deleteExpense(req.actor!, req.params.id);
  res.status(204).send();
}
