import { prisma } from "../../config/prisma";
import { BadRequestError } from "../../utils/errors";
import { ResolvedDateRange } from "../../utils/dateRange";
import { derivePaymentStatus } from "../invoices/invoices.service";
import { financialsForFees, sumDecimal } from "./accountsQueries";
import { ReportTable } from "../reports/reports.service";

/**
 * ACCOUNTS module (2026-08-14) — §25 Reports. Builds the same generic `ReportTable`
 * shape `reports.service.ts` already defines and that `reportsExport.pdf.ts`/
 * `reportsExport.excel.ts` already know how to render, reused here as plain function
 * calls. Deliberately NOT added as new cases inside `reports.service.ts`'s own
 * `generateReport()` dispatcher — that would make these report types inherit
 * REPORTS.VIEW/REPORTS.EXPORT gating from the existing `/api/reports` route instead
 * of ACCOUNTS.VIEW_REPORTS, which would let a Reports-only user see Accounts data
 * without ever holding any Accounts permission (and vice versa). Exposed instead
 * through GET /api/accounts/reports/:type, gated by ACCOUNTS.VIEW_REPORTS alone.
 */
export type AccountsReportType =
  | "CLIENT_OUTSTANDING"
  | "CASE_OUTSTANDING"
  | "PAYMENTS_BY_DATE"
  | "EXPENSES_BY_DATE"
  | "EXPENSES_BY_CATEGORY"
  | "TOTALS"
  | "PENDING_INVOICES"
  /** §34 — Accounts Overview/Expenses completion pass (2026-08-15). Distinguishes
   * General/Client-level/Case-level expenses, matching the same three kinds the
   * Accounts → Expenses panel filters by. */
  | "OVERALL_EXPENSES"
  | "GENERAL_EXPENSES"
  | "CLIENT_EXPENSES"
  | "CASE_EXPENSES";

export const ACCOUNTS_REPORT_TYPES: AccountsReportType[] = [
  "CLIENT_OUTSTANDING",
  "CASE_OUTSTANDING",
  "PAYMENTS_BY_DATE",
  "EXPENSES_BY_DATE",
  "EXPENSES_BY_CATEGORY",
  "TOTALS",
  "PENDING_INVOICES",
  "OVERALL_EXPENSES",
  "GENERAL_EXPENSES",
  "CLIENT_EXPENSES",
  "CASE_EXPENSES",
];

type ExpenseKind = "General / Firm Expense" | "Client-Level" | "Case-Level";

function labelExpenseKind(e: { caseId: string | null; clientId: string | null }): ExpenseKind {
  if (e.caseId) return "Case-Level";
  if (e.clientId) return "Client-Level";
  return "General / Firm Expense";
}

async function clientOutstandingReport(): Promise<ReportTable> {
  const financials = await financialsForFees({});
  const byClient = new Map<string, { outstanding: number; overdue: number }>();
  for (const f of financials) {
    const entry = byClient.get(f.clientId) ?? { outstanding: 0, overdue: 0 };
    entry.outstanding += f.outstanding.toNumber();
    if (f.isOverdue) entry.overdue += f.outstanding.toNumber();
    byClient.set(f.clientId, entry);
  }
  const clients = await prisma.client.findMany({
    where: { id: { in: Array.from(byClient.keys()) } },
    select: { id: true, clientId: true, name: true },
  });
  return {
    title: "Client-wise Outstanding & Overdue",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "clientId", label: "Client ID" },
      { key: "name", label: "Client Name" },
      { key: "outstanding", label: "Outstanding" },
      { key: "overdue", label: "Overdue" },
    ],
    rows: clients.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      outstanding: (byClient.get(c.id)?.outstanding ?? 0).toFixed(2),
      overdue: (byClient.get(c.id)?.overdue ?? 0).toFixed(2),
    })),
  };
}

async function caseOutstandingReport(): Promise<ReportTable> {
  const financials = await financialsForFees({});
  const byCase = new Map<string, { outstanding: number; overdue: number }>();
  for (const f of financials) {
    if (!f.caseId) continue;
    const entry = byCase.get(f.caseId) ?? { outstanding: 0, overdue: 0 };
    entry.outstanding += f.outstanding.toNumber();
    if (f.isOverdue) entry.overdue += f.outstanding.toNumber();
    byCase.set(f.caseId, entry);
  }
  const cases = await prisma.case.findMany({
    where: { id: { in: Array.from(byCase.keys()) } },
    select: { id: true, matterNumber: true, courtCaseNumber: true },
  });
  return {
    title: "Case-wise Outstanding & Overdue",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "matterNumber", label: "Matter Number" },
      { key: "courtCaseNumber", label: "Case Number" },
      { key: "outstanding", label: "Outstanding" },
      { key: "overdue", label: "Overdue" },
    ],
    rows: cases.map((c) => ({
      matterNumber: c.matterNumber,
      courtCaseNumber: c.courtCaseNumber ?? "",
      outstanding: (byCase.get(c.id)?.outstanding ?? 0).toFixed(2),
      overdue: (byCase.get(c.id)?.overdue ?? 0).toFixed(2),
    })),
  };
}

async function paymentsByDateReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const payments = await prisma.accountsPayment.findMany({
    where: { deletedAt: null, paymentDate: range ? { gte: range.gte, lte: range.lte } : undefined },
    include: { client: { select: { name: true, clientId: true } }, case: { select: { matterNumber: true } } },
    orderBy: { paymentDate: "desc" },
  });
  return {
    title: "Payments Received by Date",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "date", label: "Date" },
      { key: "client", label: "Client" },
      { key: "case", label: "Case" },
      { key: "amount", label: "Amount" },
      { key: "mode", label: "Mode" },
    ],
    rows: payments.map((p) => ({
      date: p.paymentDate.toISOString().slice(0, 10),
      client: p.client.name,
      case: p.case?.matterNumber ?? "",
      amount: p.amount.toFixed(2),
      mode: p.mode,
    })),
  };
}

const EXPENSE_REPORT_INCLUDE = {
  case: { select: { matterNumber: true } },
  client: { select: { name: true, clientId: true } },
} as const;

/** §34 — every expense report row now carries Type/Client/Case so General,
 * Client-level, and Case-level rows are all distinguishable in one table. */
function expenseReportRow(e: {
  date: Date;
  category: string;
  amount: number;
  vendor: string | null;
  caseId: string | null;
  clientId: string | null;
  case: { matterNumber: string } | null;
  client: { name: string; clientId: string } | null;
}) {
  return {
    date: e.date.toISOString().slice(0, 10),
    type: labelExpenseKind(e),
    client: e.client?.name ?? "",
    case: e.case?.matterNumber ?? "",
    category: e.category,
    vendor: e.vendor ?? "",
    amount: e.amount.toFixed(2),
  };
}

const EXPENSE_REPORT_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "client", label: "Client" },
  { key: "case", label: "Case" },
  { key: "category", label: "Category" },
  { key: "vendor", label: "Vendor" },
  { key: "amount", label: "Amount" },
];

async function expensesByDateReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const expenses = await prisma.expense.findMany({
    where: { deletedAt: null, date: range ? { gte: range.gte, lte: range.lte } : undefined },
    include: EXPENSE_REPORT_INCLUDE,
    orderBy: { date: "desc" },
  });
  return {
    title: "Expenses by Date",
    generatedAt: new Date().toISOString(),
    columns: EXPENSE_REPORT_COLUMNS,
    rows: expenses.map(expenseReportRow),
  };
}

/** §34 — "Overall Expense Report... must include all expense types." Identical shape
 * to expensesByDateReport, kept as its own named report type so it appears
 * separately in the report picker (§34's explicit list of distinct report types). */
async function overallExpensesReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const table = await expensesByDateReport(range);
  return { ...table, title: "Overall Expense Report (General + Client-Level + Case-Level)" };
}

async function generalExpensesReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const expenses = await prisma.expense.findMany({
    where: { deletedAt: null, caseId: null, clientId: null, date: range ? { gte: range.gte, lte: range.lte } : undefined },
    include: EXPENSE_REPORT_INCLUDE,
    orderBy: { date: "desc" },
  });
  return {
    title: "General / Firm Expense Report",
    generatedAt: new Date().toISOString(),
    columns: EXPENSE_REPORT_COLUMNS,
    rows: expenses.map(expenseReportRow),
  };
}

async function clientExpensesReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const expenses = await prisma.expense.findMany({
    where: {
      deletedAt: null,
      caseId: null,
      clientId: { not: null },
      date: range ? { gte: range.gte, lte: range.lte } : undefined,
    },
    include: EXPENSE_REPORT_INCLUDE,
    orderBy: { date: "desc" },
  });
  return {
    title: "Client-Level Expense Report",
    generatedAt: new Date().toISOString(),
    columns: EXPENSE_REPORT_COLUMNS,
    rows: expenses.map(expenseReportRow),
  };
}

async function caseExpensesReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const expenses = await prisma.expense.findMany({
    where: { deletedAt: null, caseId: { not: null }, date: range ? { gte: range.gte, lte: range.lte } : undefined },
    include: EXPENSE_REPORT_INCLUDE,
    orderBy: { date: "desc" },
  });
  return {
    title: "Case-Level Expense Report",
    generatedAt: new Date().toISOString(),
    columns: EXPENSE_REPORT_COLUMNS,
    rows: expenses.map(expenseReportRow),
  };
}

async function expensesByCategoryReport(range?: ResolvedDateRange): Promise<ReportTable> {
  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    where: { deletedAt: null, date: range ? { gte: range.gte, lte: range.lte } : undefined },
    _sum: { amount: true },
    orderBy: { category: "asc" },
  });
  return {
    title: "Expenses by Category",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "category", label: "Category" },
      { key: "total", label: "Total" },
    ],
    rows: grouped.map((g) => ({ category: g.category, total: (g._sum.amount ?? 0).toFixed(2) })),
  };
}

async function totalsReport(): Promise<ReportTable> {
  const [feeTotal, paymentTotal, expenseTotal] = await Promise.all([
    prisma.professionalFee.aggregate({ _sum: { amount: true }, where: { deletedAt: null } }),
    prisma.accountsPayment.aggregate({ _sum: { amount: true }, where: { deletedAt: null } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { deletedAt: null } }),
  ]);
  const financials = await financialsForFees({});
  const outstanding = sumDecimal(financials.map((f) => f.outstanding));
  return {
    title: "Totals — Fees, Payments, Expenses",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Value" },
    ],
    rows: [
      { metric: "Total Professional Fees", value: (feeTotal._sum.amount?.toNumber() ?? 0).toFixed(2) },
      { metric: "Total Payments Received", value: (paymentTotal._sum.amount?.toNumber() ?? 0).toFixed(2) },
      { metric: "Total Outstanding", value: outstanding.toFixed(2) },
      { metric: "Total Expenses", value: (expenseTotal._sum.amount ?? 0).toFixed(2) },
    ],
  };
}

async function pendingInvoicesReport(): Promise<ReportTable> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: "DRAFT" } },
    include: { client: { select: { name: true, clientId: true } }, case: { select: { matterNumber: true } } },
    orderBy: { issueDate: "desc" },
  });
  const pending = invoices.filter((i) => derivePaymentStatus(i) !== "PAID");
  return {
    title: "Pending Invoices",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "client", label: "Client" },
      { key: "case", label: "Case" },
      { key: "total", label: "Total" },
      { key: "status", label: "Status" },
    ],
    rows: pending.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      client: i.client.name,
      case: i.case?.matterNumber ?? "",
      total: i.total.toFixed(2),
      status: derivePaymentStatus(i),
    })),
  };
}

export async function buildAccountsReport(type: AccountsReportType, range?: ResolvedDateRange): Promise<ReportTable> {
  switch (type) {
    case "CLIENT_OUTSTANDING":
      return clientOutstandingReport();
    case "CASE_OUTSTANDING":
      return caseOutstandingReport();
    case "PAYMENTS_BY_DATE":
      return paymentsByDateReport(range);
    case "EXPENSES_BY_DATE":
      return expensesByDateReport(range);
    case "EXPENSES_BY_CATEGORY":
      return expensesByCategoryReport(range);
    case "TOTALS":
      return totalsReport();
    case "PENDING_INVOICES":
      return pendingInvoicesReport();
    case "OVERALL_EXPENSES":
      return overallExpensesReport(range);
    case "GENERAL_EXPENSES":
      return generalExpensesReport(range);
    case "CLIENT_EXPENSES":
      return clientExpensesReport(range);
    case "CASE_EXPENSES":
      return caseExpensesReport(range);
    default:
      throw new BadRequestError("Unknown report type");
  }
}
