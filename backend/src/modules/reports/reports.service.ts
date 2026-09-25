import { prisma } from "../../config/prisma";
import { BadRequestError } from "../../utils/errors";

/**
 * Milestone 3 (Version 1.0 completion, SRD Section 19 — Reports & Analytics). Every
 * report shares one generic tabular shape (`ReportTable`) so a single PDF/Excel
 * renderer (reportsExport.pdf.ts/reportsExport.excel.ts) can export any of them,
 * rather than one bespoke exporter per report type.
 *
 * Scope note on "Matter Profitability": the SRD names this report but this
 * application has no per-employee hourly cost rate anywhere in the schema (Milestone
 * 2's Invoice line-item rate is a *billing* rate set at invoice time, not a cost),
 * so "profitability" here is defined honestly as Total Invoiced minus Total Expenses
 * for the matter — the one profitability signal the actual data supports — documented
 * here and in CHANGELOG.md rather than fabricating a cost model the SRD never specified.
 *
 * Scope note on export formats: PDF and Excel only, not Word — matching the precedent
 * already set by the Cause List module (Section 15.1a), which also exports PDF/Excel
 * only despite Section 25's narrative mentioning Word; adding a third export library
 * for a format used nowhere else in the app was a deliberate scope call, not an
 * oversight.
 */
export interface ReportTable {
  title: string;
  generatedAt: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
}

function dateRange(filters: ReportFilters) {
  const gte = filters.startDate ? new Date(filters.startDate) : undefined;
  const lte = filters.endDate ? new Date(filters.endDate) : undefined;
  if (gte && Number.isNaN(gte.getTime())) throw new BadRequestError("Invalid startDate");
  if (lte && Number.isNaN(lte.getTime())) throw new BadRequestError("Invalid endDate");
  return { gte, lte };
}

async function caseSummaryReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const cases = await prisma.case.findMany({
    where: { deletedAt: null, ...(gte || lte ? { createdAt: { gte, lte } } : {}) },
    select: { matterNumber: true, title: true, status: true, practiceArea: true, partner: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return {
    title: "Case Summary Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "matterNumber", label: "Matter Number" },
      { key: "title", label: "Cause Title" },
      { key: "practiceArea", label: "Practice Area" },
      { key: "partner", label: "Partner" },
      { key: "status", label: "Status" },
      { key: "daysOpen", label: "Days Open" },
    ],
    // New Case form simplification (2026-08-11) — title/practiceArea are now optional.
    rows: cases.map((c) => ({
      matterNumber: c.matterNumber,
      title: c.title ?? "",
      practiceArea: c.practiceArea ?? "",
      partner: c.partner.name,
      status: c.status,
      daysOpen: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
    })),
  };
}

async function financialReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const dateFilter = gte || lte ? { gte, lte } : undefined;

  const [payments, invoices, timeLogs] = await Promise.all([
    prisma.payment.findMany({ where: dateFilter ? { paidAt: dateFilter } : {}, select: { amount: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["APPROVED", "SENT", "PARTIALLY_PAID"] } },
      select: { total: true, payments: { select: { amount: true } } },
    }),
    prisma.timeLog.findMany({
      where: { billable: true, ...(dateFilter ? { date: dateFilter } : {}) },
      select: { hours: true },
    }),
  ]);

  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const receivables = invoices.reduce((sum, inv) => sum + (inv.total - inv.payments.reduce((s, p) => s + p.amount, 0)), 0);
  const billableHours = timeLogs.reduce((sum, t) => sum + t.hours, 0);

  return {
    title: "Financial Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Value" },
    ],
    rows: [
      { metric: "Revenue Collected (payments recorded)", value: revenue },
      { metric: "Outstanding Receivables (unpaid balance on approved+ invoices)", value: receivables },
      { metric: "Billable Hours Logged", value: billableHours },
    ],
  };
}

async function matterProfitabilityReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const cases = await prisma.case.findMany({
    where: { deletedAt: null, ...(gte || lte ? { createdAt: { gte, lte } } : {}) },
    select: {
      matterNumber: true,
      title: true,
      invoices: { select: { total: true } },
      expenses: { where: { deletedAt: null }, select: { amount: true } },
    },
  });
  return {
    title: "Matter Profitability Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "matterNumber", label: "Matter Number" },
      { key: "title", label: "Cause Title" },
      { key: "totalInvoiced", label: "Total Invoiced" },
      { key: "totalExpenses", label: "Total Expenses" },
      { key: "profit", label: "Profit (Invoiced - Expenses)" },
    ],
    rows: cases
      .map((c) => {
        const totalInvoiced = c.invoices.reduce((s, i) => s + i.total, 0);
        const totalExpenses = c.expenses.reduce((s, e) => s + e.amount, 0);
        return {
          matterNumber: c.matterNumber,
          // New Case form simplification (2026-08-11) — title is now optional.
          title: c.title ?? "",
          totalInvoiced,
          totalExpenses,
          profit: totalInvoiced - totalExpenses,
        };
      })
      .filter((r) => r.totalInvoiced > 0 || r.totalExpenses > 0),
  };
}

async function staffPerformanceReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const users = await prisma.user.findMany({
    where: { role: { in: ["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE"] }, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      role: true,
      tasksAssignedToMe: {
        where: { deletedAt: null, ...(gte || lte ? { createdAt: { gte, lte } } : {}) },
        select: { status: true, dueDate: true, completedAt: true },
      },
      timeLogs: {
        where: gte || lte ? { date: { gte, lte } } : {},
        select: { hours: true, billable: true },
      },
    },
  });

  return {
    title: "Staff Performance Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "tasksCompleted", label: "Tasks Completed" },
      { key: "tasksPending", label: "Tasks Pending" },
      { key: "tasksOverdue", label: "Tasks Overdue" },
      { key: "billableHours", label: "Billable Hours Logged" },
    ],
    rows: users.map((u) => {
      const now = new Date();
      const tasksCompleted = u.tasksAssignedToMe.filter((t) => t.status === "COMPLETED").length;
      const tasksPending = u.tasksAssignedToMe.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
      const tasksOverdue = u.tasksAssignedToMe.filter(
        (t) => t.status !== "COMPLETED" && !!t.dueDate && t.dueDate < now
      ).length;
      const billableHours = u.timeLogs.filter((t) => t.billable).reduce((s, t) => s + t.hours, 0);
      return { name: u.name, role: u.role, tasksCompleted, tasksPending, tasksOverdue, billableHours };
    }),
  };
}

async function hearingOutcomeReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const hearings = await prisma.hearing.findMany({
    where: { ...(gte || lte ? { hearingDate: { gte, lte } } : {}) },
    select: {
      hearingDate: true,
      status: true,
      outcomeNotes: true,
      courtName: true,
      case: { select: { matterNumber: true, title: true } },
    },
    orderBy: { hearingDate: "desc" },
  });
  return {
    title: "Hearing Outcome Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "matterNumber", label: "Matter Number" },
      { key: "title", label: "Cause Title" },
      { key: "courtName", label: "Court" },
      { key: "hearingDate", label: "Hearing Date" },
      { key: "status", label: "Status" },
      { key: "outcomeNotes", label: "Outcome Notes" },
    ],
    rows: hearings.map((h) => ({
      matterNumber: h.case.matterNumber,
      // New Case form simplification (2026-08-11) — title is now optional.
      title: h.case.title ?? "",
      courtName: h.courtName ?? "",
      hearingDate: h.hearingDate.toLocaleString(),
      status: h.status,
      outcomeNotes: h.outcomeNotes ?? "",
    })),
  };
}

async function tagBasedReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const tags = await prisma.caseTag.findMany({
    where: { case: { deletedAt: null, ...(gte || lte ? { createdAt: { gte, lte } } : {}) } },
    select: { tag: true, case: { select: { invoices: { select: { total: true } } } } },
  });
  const byTag = new Map<string, { caseload: number; revenue: number }>();
  for (const t of tags) {
    const entry = byTag.get(t.tag) ?? { caseload: 0, revenue: 0 };
    entry.caseload += 1;
    entry.revenue += t.case.invoices.reduce((s, i) => s + i.total, 0);
    byTag.set(t.tag, entry);
  }
  return {
    title: "Tag-Based Report",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "tag", label: "Tag" },
      { key: "caseload", label: "Caseload" },
      { key: "revenue", label: "Revenue (Total Invoiced)" },
    ],
    rows: Array.from(byTag.entries())
      .map(([tag, v]) => ({ tag, caseload: v.caseload, revenue: v.revenue }))
      .sort((a, b) => b.caseload - a.caseload),
  };
}

/** SRD Section 25 — Data Import & Export names "case list, client list" among the
 * exportable items. Rather than bolting a duplicate Export button onto the Case List
 * and Client List screens themselves, this is exposed as two more report types on the
 * same Reports screen/export pipeline every other report already uses — one export
 * surface, not several inconsistent ones. */
async function clientListReport(filters: ReportFilters): Promise<ReportTable> {
  const { gte, lte } = dateRange(filters);
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, ...(gte || lte ? { createdAt: { gte, lte } } : {}) },
    select: { clientId: true, name: true, type: true, email: true, phone: true, status: true },
    orderBy: { clientId: "asc" },
  });
  return {
    title: "Client List",
    generatedAt: new Date().toISOString(),
    columns: [
      { key: "clientId", label: "Client ID" },
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "status", label: "Status" },
    ],
    rows: clients.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      type: c.type ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      status: c.status,
    })),
  };
}

export type ReportType =
  | "case-summary"
  | "financial"
  | "matter-profitability"
  | "staff-performance"
  | "hearing-outcome"
  | "tag-based"
  | "client-list";

export const REPORT_TYPES: ReportType[] = [
  "case-summary",
  "financial",
  "matter-profitability",
  "staff-performance",
  "hearing-outcome",
  "tag-based",
  "client-list",
];

export async function generateReport(type: string, filters: ReportFilters): Promise<ReportTable> {
  switch (type) {
    case "case-summary":
      return caseSummaryReport(filters);
    case "financial":
      return financialReport(filters);
    case "matter-profitability":
      return matterProfitabilityReport(filters);
    case "staff-performance":
      return staffPerformanceReport(filters);
    case "hearing-outcome":
      return hearingOutcomeReport(filters);
    case "tag-based":
      return tagBasedReport(filters);
    case "client-list":
      return clientListReport(filters);
    default:
      throw new BadRequestError(`Unknown report type: ${type}`);
  }
}
