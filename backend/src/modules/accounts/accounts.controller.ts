import { Request, Response } from "express";
import { z } from "zod";
import { PaymentMode } from "@prisma/client";
import { parseBody } from "../../utils/validators";
import { BadRequestError } from "../../utils/errors";
import { streamReportPdf } from "../reports/reportsExport.pdf";
import { writeReportWorkbook } from "../reports/reportsExport.excel";
import { streamReportCsv } from "../reports/reportsExport.csv";
import { resolveAccountsDateRange, AccountsDateRangePreset } from "../../utils/dateRange";
import * as accountsService from "./accounts.service";
import { buildAccountsReport, ACCOUNTS_REPORT_TYPES, AccountsReportType } from "./accountsReports.service";

export async function getMyAccountsPermissions(req: Request, res: Response) {
  res.json(accountsService.accountsPermissionFlags(req.actor!));
}

/** Accounts Overview completion pass (2026-08-15) — §2's date-range selector.
 * `preset` omitted entirely = "all time" (matches every other Accounts list/report's
 * existing no-range convention); any recognized preset (including CUSTOM, which
 * additionally requires startDate/endDate) resolves via the same
 * resolveAccountsDateRange() the Reports panel already uses. */
export async function getDashboard(req: Request, res: Response) {
  const { preset, startDate, endDate } = req.query as Record<string, string | undefined>;
  const range =
    preset && DATE_RANGE_PRESETS.includes(preset as AccountsDateRangePreset)
      ? resolveAccountsDateRange(preset as AccountsDateRangePreset, startDate, endDate)
      : undefined;
  res.json(await accountsService.getDashboard(range));
}

export async function listOverdue(req: Request, res: Response) {
  res.json(await accountsService.listOverdue(req.query.search as string | undefined));
}

export async function listDueSoon(req: Request, res: Response) {
  res.json(await accountsService.listDueSoon(req.query.search as string | undefined));
}

export async function searchClients(req: Request, res: Response) {
  res.json(await accountsService.searchClients((req.query.q as string | undefined) ?? ""));
}

export async function getClientSummary(req: Request, res: Response) {
  res.json(await accountsService.getClientSummary(req.actor!, req.params.clientId));
}

export async function searchCases(req: Request, res: Response) {
  res.json(await accountsService.searchCases((req.query.q as string | undefined) ?? ""));
}

export async function getCaseSummary(req: Request, res: Response) {
  res.json(await accountsService.getCaseAccountsData(req.actor!, req.params.caseId));
}

export async function getCaseAccountsTabData(req: Request, res: Response) {
  res.json(await accountsService.getCaseAccountsData(req.actor!, req.params.caseId));
}

/**
 * Simplified Case Expense Entry (2026-08-17) — "Cases → Case → Billing / Expenses
 * → Add Expense". §14/§15/§18 — exactly four fields, nothing else: Date,
 * Description (required, unlike the general Accounts expense form where it's
 * optional — this quick form's whole point is Date+Description+Amount+Entered
 * By), and Amount. No Category/Payment Mode/Vendor/Client/Case/receipt field
 * exists on this form at all. §29's "Case ID... derived/validated from Case
 * context" is satisfied by taking caseId only from the route param, never the
 * body, and handing it straight to the exact same
 * accountsService.createAccountsExpense the Accounts module's own Expenses
 * screen uses, which already runs assertExpenseScopeAccess (→ assertCaseAccess)
 * and always sets incurredById from the authenticated actor — §16/§28's
 * "Entered By must be derived from the authenticated actor, never client-
 * supplied" requirement needs no new code here, it's already how that function
 * works.
 */
export async function listCaseBillingExpenses(req: Request, res: Response) {
  res.json(await accountsService.listAccountsExpenses({ caseId: req.params.caseId }));
}

const createCaseBillingExpenseSchema = z.object({
  date: z.string().datetime(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
});

/** §18/§20 — category has no field on this form; every other Expense field the
 * database still requires/supports gets a sensible constant/null default rather
 * than being asked of the user, matching the spec's own "use sensible defaults/
 * null values for fields that are not entered" instruction. */
const CASE_QUICK_EXPENSE_CATEGORY = "Case Expense";

export async function createCaseBillingExpense(req: Request, res: Response) {
  const data = parseBody(createCaseBillingExpenseSchema, req.body);
  const expense = await accountsService.createAccountsExpense(req.actor!, {
    caseId: req.params.caseId,
    category: CASE_QUICK_EXPENSE_CATEGORY,
    amount: data.amount,
    date: data.date,
    description: data.description,
  });
  res.status(201).json(expense);
}

/* --- Fees --- */

const createFeeSchema = z.object({
  clientId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  amount: z.number().positive(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  agreementDate: z.string().datetime().optional(),
  remarks: z.string().optional(),
});

export async function createFee(req: Request, res: Response) {
  const data = parseBody(createFeeSchema, req.body);
  res.status(201).json(await accountsService.createFee(req.actor!, data));
}

const updateFeeSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  agreementDate: z.string().datetime().nullable().optional(),
  remarks: z.string().optional(),
});

export async function updateFee(req: Request, res: Response) {
  const data = parseBody(updateFeeSchema, req.body);
  res.json(await accountsService.updateFee(req.actor!, req.params.id, data));
}

export async function deleteFee(req: Request, res: Response) {
  await accountsService.deleteFee(req.actor!, req.params.id);
  res.status(204).send();
}

export async function listFees(req: Request, res: Response) {
  const { clientId, caseId, startDate, endDate } = req.query as Record<string, string | undefined>;
  res.json(await accountsService.listFees({ clientId, caseId, startDate, endDate }));
}

/* --- Payments --- */

const PAYMENT_MODES = Object.values(PaymentMode) as [string, ...string[]];

/** z.coerce.number() so this schema works unchanged whether the body arrived as
 * JSON (amount already a number) or multipart/form-data (amount is a string) — see
 * the payment-receipt permission fix note in accounts.routes.ts. */
const createPaymentSchema = z.object({
  clientId: z.string().min(1),
  caseId: z.string().min(1).optional(),
  feeId: z.string().min(1).optional(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().datetime().optional(),
  mode: z.enum(PAYMENT_MODES),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
});

/**
 * Payment receipt permission fix (2026-08-15) — §14/§15 "Receipt/Proof upload
 * (optional)" must be usable by anyone who can create a payment, not only someone
 * who additionally holds ACCOUNTS.EDIT_PAYMENT. The optional receipt file (if this
 * request is multipart) is attached in the same request, via the same
 * accountsService.attachPaymentReceipt(...) function the standalone
 * POST /payments/:id/receipt route uses — but called here as a plain internal
 * function, not through that EDIT_PAYMENT-gated route, so creation-time attachment
 * is governed solely by the CREATE_PAYMENT permission that already gates this route.
 */
export async function createPayment(req: Request, res: Response) {
  const data = parseBody(createPaymentSchema, req.body);
  const payment = await accountsService.createPayment(req.actor!, data as accountsService.CreatePaymentInput);
  if (req.file) {
    const document = await accountsService.attachPaymentReceipt(req.actor!, payment.id, req.file);
    payment.receiptDocumentId = document.id;
  }
  res.status(201).json(payment);
}

const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  paymentDate: z.string().datetime().optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
});

export async function updatePayment(req: Request, res: Response) {
  const data = parseBody(updatePaymentSchema, req.body);
  res.json(await accountsService.updatePayment(req.actor!, req.params.id, data as accountsService.UpdatePaymentInput));
}

export async function deletePayment(req: Request, res: Response) {
  await accountsService.deletePayment(req.actor!, req.params.id);
  res.status(204).send();
}

export async function listPayments(req: Request, res: Response) {
  const { clientId, caseId, mode, startDate, endDate } = req.query as Record<string, string | undefined>;
  res.json(
    await accountsService.listPayments({
      clientId,
      caseId,
      mode: mode as accountsService.ListPaymentsFilters["mode"],
      startDate,
      endDate,
    })
  );
}

export async function attachPaymentReceipt(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A file is required");
  const document = await accountsService.attachPaymentReceipt(req.actor!, req.params.id, req.file);
  res.status(201).json(document);
}

/* --- Expenses (General / Client-level / Case-level — §6-§19) --- */

const EXPENSE_KINDS = ["GENERAL", "CLIENT", "CASE"] as const;

const expenseBaseSchema = z.object({
  caseId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  category: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().datetime(),
  description: z.string().optional(),
  receiptReference: z.string().optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  vendor: z.string().optional(),
});

const createExpenseSchema = expenseBaseSchema.refine((v) => !(v.caseId && v.clientId), {
  message: "An expense may be linked to a case OR a client directly, not both",
});

export async function listExpenses(req: Request, res: Response) {
  const { clientId, caseId, kind, category, paymentMode, vendor, startDate, endDate } = req.query as Record<
    string,
    string | undefined
  >;
  res.json(
    await accountsService.listAccountsExpenses({
      clientId,
      caseId,
      kind: kind && EXPENSE_KINDS.includes(kind as (typeof EXPENSE_KINDS)[number]) ? (kind as accountsService.AccountsExpenseKind) : undefined,
      category,
      paymentMode: paymentMode as PaymentMode | undefined,
      vendor,
      startDate,
      endDate,
    })
  );
}

/**
 * §9 — "Receipt / Bill Upload" is one of the case-expense form's listed fields.
 * Mirrors the payment-receipt fix's shape exactly: the optional receipt (if this
 * request is multipart) is attached in the same request via
 * accountsService.attachExpenseReceipt, gated solely by whichever ACCOUNTS.*_EXPENSE
 * permission already authorized this create — never a second, separately-gated call.
 * General/Firm expenses (2026-08-15 follow-up) support this identically to Client-
 * and Case-level expenses — attachExpenseReceipt/createReceiptDocument/
 * assertDocumentAccess all know how to create and gate a Document with no case and
 * no client at all, so no fake Client/Case is ever needed just to hold the receipt.
 */
export async function createExpense(req: Request, res: Response) {
  const data = parseBody(createExpenseSchema, req.body);
  const expense = await accountsService.createAccountsExpense(req.actor!, data as accountsService.CreateAccountsExpenseInput);
  if (req.file) {
    const document = await accountsService.attachExpenseReceipt(req.actor!, expense.id, req.file);
    expense.receiptDocumentId = document.id;
  }
  res.status(201).json(expense);
}

const updateExpenseSchema = expenseBaseSchema.omit({ caseId: true, clientId: true }).partial();

export async function updateExpense(req: Request, res: Response) {
  const data = parseBody(updateExpenseSchema, req.body);
  const expense = await accountsService.updateAccountsExpense(
    req.actor!,
    req.params.id,
    data as accountsService.UpdateAccountsExpenseInput
  );
  res.json(expense);
}

export async function deleteExpense(req: Request, res: Response) {
  await accountsService.deleteAccountsExpense(req.actor!, req.params.id);
  res.status(204).send();
}

export async function attachExpenseReceipt(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A file is required");
  const document = await accountsService.attachExpenseReceipt(req.actor!, req.params.id, req.file);
  res.status(201).json(document);
}

/* --- Invoices (thin wrapper — actual invoice CRUD lives in invoices.service.ts) --- */

export async function listInvoices(req: Request, res: Response) {
  const { clientId, caseId, startDate, endDate } = req.query as Record<string, string | undefined>;
  res.json(await accountsService.listInvoicesForAccounts({ clientId, caseId, startDate, endDate }));
}

/* --- Reports --- */

export async function listAccountsReportTypes(_req: Request, res: Response) {
  res.json(ACCOUNTS_REPORT_TYPES);
}

const DATE_RANGE_PRESETS: AccountsDateRangePreset[] = [
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "PREVIOUS_MONTH",
  "FINANCIAL_YEAR",
  "ALL_TIME",
  "CUSTOM",
];

export async function getAccountsReport(req: Request, res: Response) {
  const type = req.params.type as AccountsReportType;
  if (!ACCOUNTS_REPORT_TYPES.includes(type)) throw new BadRequestError("Unknown report type");

  const { preset, startDate, endDate, format } = req.query as Record<string, string | undefined>;
  const range =
    preset && DATE_RANGE_PRESETS.includes(preset as AccountsDateRangePreset)
      ? resolveAccountsDateRange(preset as AccountsDateRangePreset, startDate, endDate)
      : undefined;

  const table = await buildAccountsReport(type, range);

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${table.title}.pdf"`);
    return streamReportPdf(res, table);
  }
  if (format === "excel") {
    res.setHeader("Content-Disposition", `attachment; filename="${table.title}.xlsx"`);
    return writeReportWorkbook(res, table);
  }
  if (format === "csv") {
    return streamReportCsv(res, table);
  }
  res.json(table);
}
