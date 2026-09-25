import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as expensesController from "./expenses.controller";

/** Mounted at /api/cases/:caseId/expenses */
export const caseExpensesRouter = Router({ mergeParams: true });
caseExpensesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
caseExpensesRouter.get("/", requirePermission("EXPENSES.VIEW"), expensesController.listExpenses);
caseExpensesRouter.post("/", requirePermission("EXPENSES.CREATE"), expensesController.createExpense);

/** Mounted at /api/expenses */
export const expensesRouter = Router();
expensesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
expensesRouter.patch("/:id", requirePermission("EXPENSES.EDIT"), expensesController.updateExpense);
/** Soft-deletes, never a real DELETE (SRD Section 27). */
expensesRouter.delete("/:id", requirePermission("EXPENSES.DELETE"), expensesController.deleteExpense);
