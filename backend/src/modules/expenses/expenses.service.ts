import { PaymentMode } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { assertCaseAccess } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";

/** SRD Section 16.2 — Expense Management. The firm's own out-of-pocket costs per matter.
 * paymentMode/vendor/receiptDocumentId (ACCOUNTS module, 2026-08-14) are additive,
 * optional fields matching the Managing Partner's Accounts spec's exact Expense-record
 * field list — left undefined by every pre-existing caller of this function (the Case
 * → Billing → Expenses mini-form), populated only when an expense is logged via
 * Accounts. */
export interface CreateExpenseInput {
  category: string;
  amount: number;
  date: string;
  receiptReference?: string;
  billableToClient?: boolean;
  paymentMode?: PaymentMode;
  vendor?: string;
  receiptDocumentId?: string;
}

export async function createExpense(actor: AccessTokenPayload, caseId: string, input: CreateExpenseInput) {
  await assertCaseAccess(actor, caseId);
  if (input.amount <= 0) throw new BadRequestError("Amount must be greater than zero");

  const expense = await prisma.expense.create({
    data: {
      caseId,
      category: input.category,
      amount: input.amount,
      date: new Date(input.date),
      incurredById: actor.sub,
      receiptReference: input.receiptReference,
      billableToClient: input.billableToClient ?? true,
      paymentMode: input.paymentMode,
      vendor: input.vendor,
      receiptDocumentId: input.receiptDocumentId,
    },
  });
  await recordAuditLog(actor, "EXPENSE_CREATED", "Expense", expense.id, {
    entityName: expense.category,
    details: `${expense.amount}`,
  });
  return expense;
}

export async function listExpenses(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);
  return prisma.expense.findMany({
    where: { caseId, deletedAt: null },
    include: { incurredBy: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  });
}

export interface UpdateExpenseInput {
  category?: string;
  amount?: number;
  date?: string;
  receiptReference?: string;
  billableToClient?: boolean;
  paymentMode?: PaymentMode;
  vendor?: string;
  receiptDocumentId?: string;
}

async function assertEditable(id: string) {
  const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Expense not found");
  if (existing.invoiced) throw new ForbiddenError("This expense has already been invoiced and can no longer be changed");
  return existing;
}

export async function updateExpense(actor: AccessTokenPayload, id: string, input: UpdateExpenseInput) {
  const existing = await assertEditable(id);
  // Expense.caseId is nullable as of the ACCOUNTS Overview/Expenses completion pass
  // (2026-08-15, General/Client-level expenses) — but this module's own routes
  // (`caseExpensesRouter`/`expensesRouter`) only ever list/operate on ids drawn from
  // `listExpenses(actor, caseId)` below, which is itself always case-scoped, so a row
  // reached through this flow always has caseId set in practice.
  await assertCaseAccess(actor, existing.caseId!);
  if (input.amount !== undefined && input.amount <= 0) throw new BadRequestError("Amount must be greater than zero");

  const updated = await prisma.expense.update({
    where: { id },
    data: { ...input, date: input.date ? new Date(input.date) : undefined },
  });
  const changes = diffObjects(existing, updated, [
    "category",
    "amount",
    "date",
    "receiptReference",
    "billableToClient",
    "paymentMode",
    "vendor",
    "receiptDocumentId",
  ]);
  if (changes) {
    await recordAuditLog(actor, "EXPENSE_UPDATED", "Expense", id, { entityName: updated.category, changes });
  }
  return updated;
}

/** Soft-delete (SRD Section 27) — Expense is the sixth Recycle Bin entity. */
export async function deleteExpense(actor: AccessTokenPayload, id: string) {
  const existing = await assertEditable(id);
  // See the same non-null note in updateExpense above.
  await assertCaseAccess(actor, existing.caseId!);

  await prisma.expense.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: actor.sub },
  });
  await recordAuditLog(actor, "EXPENSE_DELETED", "Expense", id, {
    entityName: existing.category,
    details: `${existing.amount}`,
  });
}
