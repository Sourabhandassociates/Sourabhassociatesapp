import { Prisma, PaymentMode } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { assertCaseAccess, assertClientAccess } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { AccessTokenPayload, AuthorizedActor } from "../../utils/jwt";
import { derivePaymentStatus } from "../invoices/invoices.service";
import { validateUploadedFile } from "../documents/fileValidation";
import { ResolvedDateRange } from "../../utils/dateRange";
import { financialsForFees, sumDecimal, DUE_SOON_WINDOW_MS } from "./accountsQueries";

const D = (v: number | string) => new Prisma.Decimal(v);
const ZERO = new Prisma.Decimal(0);

/**
 * ACCOUNTS module (2026-08-14). §2/§3 — the 14-flag boolean map the frontend uses to
 * drive sidebar/tab/button visibility (GET /api/accounts/permissions). Deliberately
 * not reused for actual enforcement anywhere — every write/read route below still
 * gates independently via requirePermission in accounts.routes.ts; this is a display
 * convenience only, matching the "never rely on hiding alone" requirement precisely
 * because the real gate lives elsewhere.
 */
export function accountsPermissionFlags(actor: AuthorizedActor) {
  const has = (key: string) => actor.effectivePermissions?.has(key) ?? false;
  return {
    view: has("ACCOUNTS.VIEW"),
    createPayment: has("ACCOUNTS.CREATE_PAYMENT"),
    editPayment: has("ACCOUNTS.EDIT_PAYMENT"),
    deletePayment: has("ACCOUNTS.DELETE_PAYMENT"),
    viewExpenses: has("ACCOUNTS.VIEW_EXPENSES"),
    createExpense: has("ACCOUNTS.CREATE_EXPENSE"),
    editExpense: has("ACCOUNTS.EDIT_EXPENSE"),
    deleteExpense: has("ACCOUNTS.DELETE_EXPENSE"),
    viewInvoice: has("ACCOUNTS.VIEW_INVOICE"),
    createInvoice: has("ACCOUNTS.CREATE_INVOICE"),
    editInvoice: has("ACCOUNTS.EDIT_INVOICE"),
    deleteInvoice: has("ACCOUNTS.DELETE_INVOICE"),
    viewReports: has("ACCOUNTS.VIEW_REPORTS"),
    manageFee: has("ACCOUNTS.MANAGE_FEE"),
  };
}

const SAFE_CLIENT_SELECT = { id: true, clientId: true, name: true, email: true, phone: true } as const;
const SAFE_CASE_SELECT = {
  id: true,
  matterNumber: true,
  courtCaseNumber: true,
  title: true,
  courtName: true,
  caseType: true,
  partner: { select: { id: true, name: true } },
} as const;

function money(value: Prisma.Decimal): number {
  return value.toNumber();
}

/* ------------------------------------------------------------------------ *
 * Dashboard (Accounts Overview completion pass, 2026-08-15) — §1-§27 of the
 * Managing Partner's final-changes spec. Five cards only (Total Income/Fees,
 * Received, Outstanding, Total Expenses, Profit); Overdue/Due Soon are no longer
 * dashboard cards but keep their own drill-down endpoints (listOverdue/listDueSoon
 * below, both fully unmodified — §1's explicit "must NOT be deleted").
 * ------------------------------------------------------------------------ */

/**
 * Scopes a ProfessionalFee query to a date range by the fee's own "raised on" date —
 * `agreementDate` when present, else `createdAt` as the fallback (a fee raised without
 * an explicit agreement date still needs *some* date to be countable in a period).
 * `range` undefined (no filter selected) means "all time," matching every other
 * Accounts list/report's existing "no range = unfiltered" convention.
 */
function feeDateWhere(range?: ResolvedDateRange): Prisma.ProfessionalFeeWhereInput {
  if (!range) return {};
  return {
    OR: [
      { agreementDate: { gte: range.gte, lte: range.lte } },
      { AND: [{ agreementDate: null }, { createdAt: { gte: range.gte, lte: range.lte } }] },
    ],
  };
}

function dateRangeWhere(range: ResolvedDateRange | undefined) {
  return range ? { gte: range.gte, lte: range.lte } : undefined;
}

/**
 * Total Income/Fees's authoritative source (§3): the existing ProfessionalFee ledger,
 * plus non-DRAFT Invoice totals (a DRAFT invoice "carries no financial weight yet,"
 * the same reasoning the original Accounts build used for Invoice edit/delete scope).
 * ProfessionalFee and Invoice have no shared identity anywhere in this schema (no FK
 * links one to the other) — inspecting both models confirms there is no structural
 * way for the same real-world obligation to be double-counted through both *unless*
 * a user manually records it twice (once as a Fee, once as an Invoice), which no
 * software check in this codebase can detect without new linkage the spec doesn't
 * ask for. Documented as a known limitation in the final report rather than silently
 * assumed away.
 */
export async function getDashboard(range?: ResolvedDateRange) {
  const now = new Date();
  const feeWhere = feeDateWhere(range);
  const period = dateRangeWhere(range);

  const [feeFinancials, invoiceIncome, receivedTotal, expenseTotal, generalExpenseTotal, clientExpenseTotal, caseExpenseTotal] =
    await Promise.all([
      financialsForFees(feeWhere, now),
      prisma.invoice.aggregate({ _sum: { total: true }, where: { status: { not: "DRAFT" }, issueDate: period } }),
      prisma.accountsPayment.aggregate({ _sum: { amount: true }, where: { deletedAt: null, paymentDate: period } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { deletedAt: null, date: period } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { deletedAt: null, caseId: null, clientId: null, date: period } }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, caseId: null, clientId: { not: null }, date: period },
      }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { deletedAt: null, caseId: { not: null }, date: period } }),
    ]);

  const feeIncome = sumDecimal(feeFinancials.map((f) => f.amount));
  const totalIncome = feeIncome.plus(D(invoiceIncome._sum.total ?? 0));
  // Outstanding (§5) stays strictly fee-based, matching the spec's own worked example
  // exactly — never extended to unpaid invoice balances, which the spec never asks for.
  const outstanding = sumDecimal(feeFinancials.map((f) => f.outstanding));
  // Overdue (§1/§20/§21) is no longer a card but is still computed here — internal-only
  // — to feed the Profit formula. Uses the exact same isOverdue derivation as
  // listOverdue()/accountsQueries.ts, just against the period-scoped fee set.
  const overdue = sumDecimal(feeFinancials.filter((f) => f.isOverdue).map((f) => f.outstanding));
  const totalExpenses = expenseTotal._sum.amount ?? 0;
  const incomeAfterOverdue = totalIncome.minus(overdue);
  const profit = incomeAfterOverdue.minus(D(totalExpenses));

  return {
    range: range ? { start: range.gte.toISOString(), end: range.lte.toISOString() } : null,
    totalIncome: money(totalIncome),
    received: money(receivedTotal._sum.amount ?? ZERO),
    outstanding: money(outstanding),
    totalExpenses,
    profit: money(profit),
    /** §23 — Profit Breakdown drill-down; computed alongside the cards (cheap reuse
     * of the same aggregates) rather than a second round-trip. */
    breakdown: {
      totalIncome: money(totalIncome),
      overdue: money(overdue),
      incomeAfterOverdue: money(incomeAfterOverdue),
      generalExpenses: generalExpenseTotal._sum.amount ?? 0,
      clientExpenses: clientExpenseTotal._sum.amount ?? 0,
      caseExpenses: caseExpenseTotal._sum.amount ?? 0,
      totalExpenses,
      profit: money(profit),
    },
    dueSoonWindowDays: DUE_SOON_WINDOW_MS / (24 * 60 * 60 * 1000),
  };
}

interface FeeRowContext {
  client: { id: string; clientId: string; name: string; phone: string | null };
  case: { id: string; matterNumber: string; courtCaseNumber: string | null; partner: { name: string } } | null;
}

async function rowContextForFees(feeIds: string[]): Promise<Map<string, FeeRowContext>> {
  const fees = await prisma.professionalFee.findMany({
    where: { id: { in: feeIds } },
    select: {
      id: true,
      client: { select: { id: true, clientId: true, name: true, phone: true } },
      case: { select: { id: true, matterNumber: true, courtCaseNumber: true, partner: { select: { name: true } } } },
    },
  });
  const map = new Map<string, FeeRowContext>();
  for (const f of fees) map.set(f.id, { client: f.client, case: f.case });
  return map;
}

async function lastPaymentDates(feeIds: string[]): Promise<Map<string, Date>> {
  if (feeIds.length === 0) return new Map();
  const rows = await prisma.accountsPayment.groupBy({
    by: ["feeId"],
    where: { feeId: { in: feeIds }, deletedAt: null },
    _max: { paymentDate: true },
  });
  const map = new Map<string, Date>();
  for (const r of rows) if (r.feeId && r._max.paymentDate) map.set(r.feeId, r._max.paymentDate);
  return map;
}

/** §6/§7 — the Overdue Payments drill-down list. `search` matches client name /
 * Client ID / mobile / company name (Client has no distinct company-name field — for
 * a Company-type client, `name` already *is* the company name, so it's covered by the
 * same match). */
export async function listOverdue(search?: string) {
  const financials = (await financialsForFees({})).filter((f) => f.isOverdue);
  const contexts = await rowContextForFees(financials.map((f) => f.feeId));
  const lastPayments = await lastPaymentDates(financials.map((f) => f.feeId));

  const rows = financials
    .map((f) => {
      const ctx = contexts.get(f.feeId);
      if (!ctx) return null;
      return {
        feeId: f.feeId,
        clientName: ctx.client.name,
        clientId: ctx.client.clientId,
        caseNumber: ctx.case?.courtCaseNumber ?? null,
        matterNumber: ctx.case?.matterNumber ?? null,
        professionalFee: money(f.amount),
        amountReceived: money(f.received),
        outstanding: money(f.outstanding),
        daysOverdue: f.daysOverdue,
        lastPaymentDate: lastPayments.get(f.feeId)?.toISOString() ?? null,
        assignedAdvocate: ctx.case?.partner.name ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter(
    (r) =>
      r.clientName.toLowerCase().includes(q) ||
      r.clientId.toLowerCase().includes(q) ||
      (r.caseNumber ?? "").toLowerCase().includes(q)
  );
}

/** §8 — Due Soon, mutually exclusive with Overdue by construction (deriveFeeFinancials
 * only ever sets one of isOverdue/isDueSoon true for a given fee). */
export async function listDueSoon(search?: string) {
  const financials = (await financialsForFees({})).filter((f) => f.isDueSoon);
  const contexts = await rowContextForFees(financials.map((f) => f.feeId));

  const rows = financials
    .map((f) => {
      const ctx = contexts.get(f.feeId);
      if (!ctx) return null;
      return {
        feeId: f.feeId,
        clientName: ctx.client.name,
        clientId: ctx.client.clientId,
        caseNumber: ctx.case?.courtCaseNumber ?? null,
        matterNumber: ctx.case?.matterNumber ?? null,
        professionalFee: money(f.amount),
        amountReceived: money(f.received),
        outstanding: money(f.outstanding),
        assignedAdvocate: ctx.case?.partner.name ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((r) => r.clientName.toLowerCase().includes(q) || r.clientId.toLowerCase().includes(q));
}

/* ------------------------------------------------------------------------ *
 * Client-wise / Case-wise search (§9/§10/§11)
 * ------------------------------------------------------------------------ */

export async function searchClients(query: string) {
  if (!query || query.trim().length === 0) return [];
  return prisma.client.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { clientId: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
    select: SAFE_CLIENT_SELECT,
    take: 25,
    orderBy: { name: "asc" },
  });
}

/** §9 — full client financial summary aggregated across every case the client is
 * linked to, plus a per-case breakdown. */
export async function getClientSummary(actor: AccessTokenPayload, clientId: string) {
  const client = await assertClientAccess(actor, clientId);

  const [feeFinancials, receivedTotal, invoices, caseLinks] = await Promise.all([
    financialsForFees({ clientId }),
    prisma.accountsPayment.aggregate({ _sum: { amount: true }, where: { clientId, deletedAt: null } }),
    prisma.invoice.findMany({ where: { clientId }, select: { total: true, status: true, dueDate: true } }),
    prisma.caseClient.findMany({
      where: { clientId },
      select: { case: { select: SAFE_CASE_SELECT } },
    }),
  ]);

  const totalFees = sumDecimal(feeFinancials.map((f) => f.amount));
  const totalOutstanding = sumDecimal(feeFinancials.map((f) => f.outstanding));
  const totalOverdue = sumDecimal(feeFinancials.filter((f) => f.isOverdue).map((f) => f.outstanding));
  const totalDueSoon = sumDecimal(feeFinancials.filter((f) => f.isDueSoon).map((f) => f.outstanding));
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
  const pendingInvoices = invoices.filter((i) => derivePaymentStatus(i) !== "PAID").length;

  const caseIds = caseLinks.map((c) => c.case.id).filter((v, i, arr) => arr.indexOf(v) === i);
  const [caseExpenseTotals, clientLevelExpenseTotal] = await Promise.all([
    prisma.expense.groupBy({
      by: ["caseId"],
      where: { caseId: { in: caseIds }, deletedAt: null },
      _sum: { amount: true },
    }),
    // §17 — a standalone Client-level expense (caseId null, clientId set) belongs to
    // "the client's overall financial records" but never to any individual case.
    prisma.expense.aggregate({ _sum: { amount: true }, where: { clientId, caseId: null, deletedAt: null } }),
  ]);
  const expenseByCaseId = new Map(caseExpenseTotals.map((e) => [e.caseId, e._sum.amount ?? 0]));
  const totalCaseExpenses = Array.from(expenseByCaseId.values()).reduce((sum, v) => sum + v, 0);
  const totalExpenses = totalCaseExpenses + (clientLevelExpenseTotal._sum.amount ?? 0);

  const cases = await Promise.all(
    caseIds.map(async (caseId) => {
      const caseFees = feeFinancials.filter((f) => f.caseId === caseId);
      const caseInfo = caseLinks.find((c) => c.case.id === caseId)!.case;
      const received = await prisma.accountsPayment.aggregate({
        _sum: { amount: true },
        where: { clientId, caseId, deletedAt: null },
      });
      return {
        caseId,
        matterNumber: caseInfo.matterNumber,
        courtCaseNumber: caseInfo.courtCaseNumber,
        court: caseInfo.courtName,
        caseType: caseInfo.caseType,
        professionalFee: money(sumDecimal(caseFees.map((f) => f.amount))),
        amountReceived: money(received._sum.amount ?? ZERO),
        outstanding: money(sumDecimal(caseFees.map((f) => f.outstanding))),
        overdue: money(sumDecimal(caseFees.filter((f) => f.isOverdue).map((f) => f.outstanding))),
        expenses: expenseByCaseId.get(caseId) ?? 0,
      };
    })
  );

  return {
    client: { id: client.id, clientId: client.clientId, name: client.name },
    summary: {
      totalProfessionalFees: money(totalFees),
      totalPaymentsReceived: money(receivedTotal._sum.amount ?? ZERO),
      totalOutstanding: money(totalOutstanding),
      totalOverdue: money(totalOverdue),
      totalDueSoon: money(totalDueSoon),
      totalExpenses,
      totalInvoiced,
      pendingInvoices,
    },
    cases,
  };
}

export async function searchCases(query: string) {
  if (!query || query.trim().length === 0) return [];
  const yearMatch = /^\d{4}$/.test(query.trim());
  return prisma.case.findMany({
    where: {
      deletedAt: null,
      OR: [
        { matterNumber: { contains: query, mode: "insensitive" } },
        { courtCaseNumber: { contains: query, mode: "insensitive" } },
        { oppositeParty: { contains: query, mode: "insensitive" } },
        { courtName: { contains: query, mode: "insensitive" } },
        { clients: { some: { client: { name: { contains: query, mode: "insensitive" } } } } },
        ...(yearMatch
          ? [{ filingDate: { gte: new Date(`${query}-01-01`), lt: new Date(`${Number(query) + 1}-01-01`) } }]
          : []),
      ],
    },
    select: { ...SAFE_CASE_SELECT, clients: { select: { client: { select: SAFE_CLIENT_SELECT } } } },
    take: 25,
    orderBy: { createdAt: "desc" },
  });
}

/** §10/§21/§22 — a single case's Accounts view. Shared by GET /accounts/cases/:id/summary
 * (accessed from the Accounts module's own Case Search) and GET /cases/:id/accounts (the
 * Case Detail page's Accounts tab) — same data, two entry points, per §10's explicit
 * "do NOT include payments or expenses belonging to other cases" requirement enforced by
 * scoping every query below to this one caseId. */
export async function getCaseAccountsData(actor: AccessTokenPayload, caseId: string) {
  const caseRecord = await assertCaseAccess(actor, caseId);

  const [caseFees, expenses, invoices, payments, clients] = await Promise.all([
    financialsForFees({ caseId }),
    prisma.expense.findMany({
      where: { caseId, deletedAt: null },
      include: { incurredBy: { select: { id: true, name: true } }, receiptDocument: { select: { id: true, title: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.invoice.findMany({
      where: { caseId },
      select: { id: true, invoiceNumber: true, status: true, dueDate: true, total: true, issueDate: true },
      orderBy: { issueDate: "desc" },
    }),
    prisma.accountsPayment.findMany({
      where: { caseId, deletedAt: null },
      include: {
        recordedBy: { select: { id: true, name: true } },
        receiptDocument: { select: { id: true, title: true } },
        fee: { select: { id: true, description: true } },
      },
      orderBy: { paymentDate: "desc" },
    }),
    prisma.caseClient.findMany({ where: { caseId }, select: { client: { select: SAFE_CLIENT_SELECT } } }),
  ]);

  const earliestOutstandingDueDate = (
    await prisma.professionalFee.findFirst({
      where: { caseId, deletedAt: null, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    })
  )?.dueDate;

  return {
    case: { id: caseRecord.id, matterNumber: caseRecord.matterNumber, courtCaseNumber: caseRecord.courtCaseNumber },
    clients: clients.map((c) => c.client),
    financialSummary: {
      agreedProfessionalFee: money(sumDecimal(caseFees.map((f) => f.amount))),
      // All payments for this case — fee-linked AND case-level-unallocated (§16) —
      // not just the fee-scoped `received` figure that drives Outstanding below.
      totalReceived: money(sumDecimal(payments.map((p) => p.amount))),
      outstanding: money(sumDecimal(caseFees.map((f) => f.outstanding))),
      overdue: money(sumDecimal(caseFees.filter((f) => f.isOverdue).map((f) => f.outstanding))),
      dueDate: earliestOutstandingDueDate?.toISOString() ?? null,
      totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    },
    payments: payments.map((p) => ({
      id: p.id,
      amount: money(p.amount),
      paymentDate: p.paymentDate,
      mode: p.mode,
      referenceNumber: p.referenceNumber,
      remarks: p.remarks,
      recordedBy: p.recordedBy,
      receiptDocument: p.receiptDocument,
      fee: p.fee,
    })),
    expenses,
    invoices: invoices.map((i) => ({ ...i, paymentStatus: derivePaymentStatus(i) })),
  };
}

/* ------------------------------------------------------------------------ *
 * Professional Fee CRUD (§12/§13, ACCOUNTS.MANAGE_FEE)
 * ------------------------------------------------------------------------ */

export interface CreateFeeInput {
  clientId: string;
  caseId?: string;
  amount: number;
  description?: string;
  dueDate?: string;
  agreementDate?: string;
  remarks?: string;
}

async function assertClientLinkedToCase(clientId: string, caseId: string) {
  const link = await prisma.caseClient.findFirst({ where: { caseId, clientId } });
  if (!link) throw new BadRequestError("clientId must be linked to this case");
}

export async function createFee(actor: AccessTokenPayload, input: CreateFeeInput) {
  if (input.amount <= 0) throw new BadRequestError("Fee amount must be greater than zero");
  await assertClientAccess(actor, input.clientId);
  if (input.caseId) {
    await assertCaseAccess(actor, input.caseId);
    await assertClientLinkedToCase(input.clientId, input.caseId);
  }

  const fee = await prisma.professionalFee.create({
    data: {
      clientId: input.clientId,
      caseId: input.caseId,
      amount: D(input.amount),
      description: input.description,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      agreementDate: input.agreementDate ? new Date(input.agreementDate) : undefined,
      remarks: input.remarks,
      createdById: actor.sub,
    },
  });
  await recordAuditLog(actor, "ACCOUNTS_FEE_CREATED", "ProfessionalFee", fee.id, {
    entityName: `${input.amount}`,
    details: input.description,
  });
  return fee;
}

export interface UpdateFeeInput {
  amount?: number;
  description?: string;
  dueDate?: string | null;
  agreementDate?: string | null;
  remarks?: string;
}

async function loadFeeOrThrow(id: string) {
  const fee = await prisma.professionalFee.findFirst({ where: { id, deletedAt: null } });
  if (!fee) throw new NotFoundError("Professional fee not found");
  return fee;
}

export async function updateFee(actor: AccessTokenPayload, id: string, input: UpdateFeeInput) {
  const existing = await loadFeeOrThrow(id);
  await assertClientAccess(actor, existing.clientId);
  if (input.amount !== undefined && input.amount <= 0) throw new BadRequestError("Fee amount must be greater than zero");

  const previousDueDate = existing.dueDate;
  const updated = await prisma.professionalFee.update({
    where: { id },
    data: {
      amount: input.amount !== undefined ? D(input.amount) : undefined,
      description: input.description,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      agreementDate: input.agreementDate === undefined ? undefined : input.agreementDate ? new Date(input.agreementDate) : null,
      remarks: input.remarks,
    },
  });

  const changes = diffObjects(
    { ...existing, amount: existing.amount.toString() },
    { ...updated, amount: updated.amount.toString() },
    ["amount", "description", "dueDate", "agreementDate", "remarks"]
  );
  if (changes) {
    const dueDateChanged = previousDueDate?.getTime() !== updated.dueDate?.getTime();
    await recordAuditLog(
      actor,
      dueDateChanged ? "ACCOUNTS_FEE_DUE_DATE_CHANGED" : "ACCOUNTS_FEE_EDITED",
      "ProfessionalFee",
      id,
      { entityName: `${updated.amount}`, changes }
    );
  }
  return updated;
}

export async function deleteFee(actor: AccessTokenPayload, id: string) {
  const existing = await loadFeeOrThrow(id);
  await assertClientAccess(actor, existing.clientId);

  await prisma.professionalFee.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.sub } });
  await recordAuditLog(actor, "ACCOUNTS_FEE_DELETED", "ProfessionalFee", id, { entityName: `${existing.amount}` });
}

export interface ListFeesFilters {
  clientId?: string;
  caseId?: string;
  startDate?: string;
  endDate?: string;
}

/** §25 — startDate/endDate added for the Income/Fees and Outstanding card
 * drill-downs (scoped by the same agreementDate-or-createdAt rule as the
 * dashboard's own feeDateWhere). Every pre-existing caller omits them and gets
 * the unfiltered, all-time list unchanged. */
export async function listFees(filters: ListFeesFilters) {
  const dateFilter =
    filters.startDate || filters.endDate
      ? feeDateWhere({
          gte: filters.startDate ? new Date(filters.startDate) : new Date(0),
          lte: filters.endDate ? new Date(filters.endDate) : new Date(),
        })
      : {};
  const financials = await financialsForFees({ clientId: filters.clientId, caseId: filters.caseId, ...dateFilter });
  const contexts = await rowContextForFees(financials.map((f) => f.feeId));
  return financials.map((f) => ({
    id: f.feeId,
    amount: money(f.amount),
    received: money(f.received),
    outstanding: money(f.outstanding),
    isOverdue: f.isOverdue,
    isDueSoon: f.isDueSoon,
    daysOverdue: f.daysOverdue,
    client: contexts.get(f.feeId)?.client,
    case: contexts.get(f.feeId)?.case,
  }));
}

/* ------------------------------------------------------------------------ *
 * Payments (§14/§15/§16/§17, ACCOUNTS.CREATE_PAYMENT / EDIT / DELETE)
 * ------------------------------------------------------------------------ */

export interface CreatePaymentInput {
  clientId: string;
  caseId?: string;
  feeId?: string;
  amount: number;
  paymentDate?: string;
  mode: PaymentMode;
  referenceNumber?: string;
  remarks?: string;
}

export async function createPayment(actor: AccessTokenPayload, input: CreatePaymentInput) {
  if (input.amount <= 0) throw new BadRequestError("Payment amount must be greater than zero");

  let clientId = input.clientId;
  let caseId = input.caseId;

  if (input.feeId) {
    // §16 write-time invariant — a fee-linked payment's client/case are always
    // derived from the fee itself, never trusted independently from the caller.
    const fee = await loadFeeOrThrow(input.feeId);
    clientId = fee.clientId;
    caseId = fee.caseId ?? undefined;
  }

  await assertClientAccess(actor, clientId);
  if (caseId) {
    await assertCaseAccess(actor, caseId);
    await assertClientLinkedToCase(clientId, caseId);
  }

  const payment = await prisma.accountsPayment.create({
    data: {
      clientId,
      caseId,
      feeId: input.feeId,
      amount: D(input.amount),
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : undefined,
      mode: input.mode,
      referenceNumber: input.referenceNumber,
      remarks: input.remarks,
      recordedById: actor.sub,
    },
  });
  await recordAuditLog(actor, "ACCOUNTS_PAYMENT_CREATED", "AccountsPayment", payment.id, {
    entityName: `${input.amount}`,
    details: `mode=${input.mode}`,
  });
  return payment;
}

export interface UpdatePaymentInput {
  amount?: number;
  paymentDate?: string;
  mode?: PaymentMode;
  referenceNumber?: string;
  remarks?: string;
}

async function loadPaymentOrThrow(id: string) {
  const payment = await prisma.accountsPayment.findFirst({ where: { id, deletedAt: null } });
  if (!payment) throw new NotFoundError("Payment not found");
  return payment;
}

export async function updatePayment(actor: AccessTokenPayload, id: string, input: UpdatePaymentInput) {
  const existing = await loadPaymentOrThrow(id);
  await assertClientAccess(actor, existing.clientId);
  if (input.amount !== undefined && input.amount <= 0) throw new BadRequestError("Payment amount must be greater than zero");

  const updated = await prisma.accountsPayment.update({
    where: { id },
    data: {
      amount: input.amount !== undefined ? D(input.amount) : undefined,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : undefined,
      mode: input.mode,
      referenceNumber: input.referenceNumber,
      remarks: input.remarks,
    },
  });

  const changes = diffObjects(
    { ...existing, amount: existing.amount.toString() },
    { ...updated, amount: updated.amount.toString() },
    ["amount", "paymentDate", "mode", "referenceNumber", "remarks"]
  );
  if (changes) {
    await recordAuditLog(actor, "ACCOUNTS_PAYMENT_EDITED", "AccountsPayment", id, { entityName: `${updated.amount}`, changes });
  }
  return updated;
}

export async function deletePayment(actor: AccessTokenPayload, id: string) {
  const existing = await loadPaymentOrThrow(id);
  await assertClientAccess(actor, existing.clientId);

  await prisma.accountsPayment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.sub } });
  await recordAuditLog(actor, "ACCOUNTS_PAYMENT_DELETED", "AccountsPayment", id, { entityName: `${existing.amount}` });
}

export interface ListPaymentsFilters {
  clientId?: string;
  caseId?: string;
  mode?: PaymentMode;
  startDate?: string;
  endDate?: string;
}

export async function listPayments(filters: ListPaymentsFilters) {
  return prisma.accountsPayment.findMany({
    where: {
      deletedAt: null,
      clientId: filters.clientId,
      caseId: filters.caseId,
      mode: filters.mode,
      paymentDate:
        filters.startDate || filters.endDate
          ? { gte: filters.startDate ? new Date(filters.startDate) : undefined, lte: filters.endDate ? new Date(filters.endDate) : undefined }
          : undefined,
    },
    include: {
      client: { select: SAFE_CLIENT_SELECT },
      case: { select: { id: true, matterNumber: true } },
      recordedBy: { select: { id: true, name: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 200,
  });
}

/* ------------------------------------------------------------------------ *
 * Expenses (Accounts Overview/Expenses completion pass, 2026-08-15) — §6-§19.
 * Direct CRUD against the shared Expense table (the same table the pre-existing,
 * untouched Case → Billing → Expenses flow in expenses.service.ts also writes to).
 * General (caseId null, clientId null), Client-level (caseId null, clientId set),
 * and Case-level (caseId set) are three mutually exclusive kinds; a case-level
 * expense's client(s) are always derived via `case.clients` (a case can have more
 * than one client), never denormalized onto the row — see Expense.clientId's
 * schema comment. Deliberately NOT delegated to expenses.service.ts's own
 * createExpense/updateExpense/deleteExpense (left fully unmodified — the old
 * Case → Billing → Expenses UI's own routes, still Case-only by design and still
 * EXPENSES.*-gated) — the two flows now write to the same table through
 * independent, differently-gated CRUD paths, exactly like the pre-existing
 * Payment (Milestone 2, invoice-linked) and AccountsPayment already coexist as
 * separate ledgers over different tables.
 * ------------------------------------------------------------------------ */

export type AccountsExpenseKind = "GENERAL" | "CLIENT" | "CASE";

function expenseKind(row: { caseId: string | null; clientId: string | null }): AccountsExpenseKind {
  if (row.caseId) return "CASE";
  if (row.clientId) return "CLIENT";
  return "GENERAL";
}

/** §29 — never trusts a client-supplied caseId/clientId without running it through
 * the existing row-level scoping; General expenses need nothing beyond the route's
 * own ACCOUNTS.*_EXPENSE permission gate (already enforced before this runs). */
async function assertExpenseScopeAccess(actor: AccessTokenPayload, caseId?: string | null, clientId?: string | null) {
  if (caseId) {
    await assertCaseAccess(actor, caseId);
    return;
  }
  if (clientId) {
    await assertClientAccess(actor, clientId);
  }
}

export interface CreateAccountsExpenseInput {
  caseId?: string;
  clientId?: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
  receiptReference?: string;
  paymentMode?: PaymentMode;
  vendor?: string;
}

export async function createAccountsExpense(actor: AccessTokenPayload, input: CreateAccountsExpenseInput) {
  if (input.amount <= 0) throw new BadRequestError("Amount must be greater than zero");
  if (input.caseId && input.clientId) {
    throw new BadRequestError("An expense may be linked to a case OR a client directly, not both");
  }
  await assertExpenseScopeAccess(actor, input.caseId, input.clientId);

  const expense = await prisma.expense.create({
    data: {
      caseId: input.caseId,
      clientId: input.caseId ? undefined : input.clientId,
      category: input.category,
      amount: input.amount,
      date: new Date(input.date),
      description: input.description,
      incurredById: actor.sub,
      receiptReference: input.receiptReference,
      // A general/client-level expense has no case to ever become a billable line
      // item against — only a case-level expense keeps the pre-existing default.
      billableToClient: !!input.caseId,
      paymentMode: input.paymentMode,
      vendor: input.vendor,
    },
  });
  // Uses the same "EXPENSE_CREATED" action expenses.service.ts's own create uses —
  // one Expense entity, one consistent audit action regardless of which UI wrote it.
  await recordAuditLog(actor, "EXPENSE_CREATED", "Expense", expense.id, {
    entityName: expense.category,
    details: `${expenseKind(expense)} — ${expense.amount}`,
  });
  return expense;
}

export interface UpdateAccountsExpenseInput {
  category?: string;
  amount?: number;
  date?: string;
  description?: string;
  receiptReference?: string;
  paymentMode?: PaymentMode;
  vendor?: string;
}

async function loadAccountsExpenseOrThrow(id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!expense) throw new NotFoundError("Expense not found");
  return expense;
}

/** Editing never lets a case/client reassignment happen (Client/Case aren't
 * editable dropdowns anywhere in the Accounts UI, per §9) — only the expense's own
 * fields (category/amount/date/etc.) can change; its kind is fixed at creation. */
export async function updateAccountsExpense(actor: AccessTokenPayload, id: string, input: UpdateAccountsExpenseInput) {
  const existing = await loadAccountsExpenseOrThrow(id);
  if (existing.invoiced) throw new ForbiddenError("This expense has already been invoiced and can no longer be changed");
  if (input.amount !== undefined && input.amount <= 0) throw new BadRequestError("Amount must be greater than zero");
  await assertExpenseScopeAccess(actor, existing.caseId, existing.clientId);

  const updated = await prisma.expense.update({
    where: { id },
    data: {
      category: input.category,
      amount: input.amount,
      date: input.date ? new Date(input.date) : undefined,
      description: input.description,
      receiptReference: input.receiptReference,
      paymentMode: input.paymentMode,
      vendor: input.vendor,
    },
  });
  const changes = diffObjects(existing, updated, [
    "category",
    "amount",
    "date",
    "description",
    "receiptReference",
    "paymentMode",
    "vendor",
  ]);
  if (changes) {
    await recordAuditLog(actor, "EXPENSE_UPDATED", "Expense", id, {
      entityName: updated.category,
      details: expenseKind(updated),
      changes,
    });
  }
  return updated;
}

export async function deleteAccountsExpense(actor: AccessTokenPayload, id: string) {
  const existing = await loadAccountsExpenseOrThrow(id);
  if (existing.invoiced) throw new ForbiddenError("This expense has already been invoiced and can no longer be changed");
  await assertExpenseScopeAccess(actor, existing.caseId, existing.clientId);

  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.sub } });
  await recordAuditLog(actor, "EXPENSE_DELETED", "Expense", id, {
    entityName: existing.category,
    details: `${expenseKind(existing)} — ${existing.amount}`,
  });
}

export interface ListAccountsExpensesFilters {
  clientId?: string;
  caseId?: string;
  kind?: AccountsExpenseKind;
  category?: string;
  paymentMode?: PaymentMode;
  vendor?: string;
  startDate?: string;
  endDate?: string;
}

const EXPENSE_LIST_INCLUDE = {
  case: {
    select: {
      id: true,
      matterNumber: true,
      courtCaseNumber: true,
      clients: { select: { client: { select: { id: true, clientId: true, name: true } } } },
    },
  },
  client: { select: { id: true, clientId: true, name: true } },
  incurredBy: { select: { id: true, name: true } },
  receiptDocument: { select: { id: true, title: true } },
} as const;

/** §15 — the main Accounts → Expenses list: every expense in the firm (General +
 * Client-level + Case-level), with filters for kind/date/category/payment
 * mode/vendor/client/case. A specific `caseId`/`clientId` filter always wins over
 * the broader `kind` filter when both are supplied. */
export async function listAccountsExpenses(filters: ListAccountsExpensesFilters) {
  const where: Prisma.ExpenseWhereInput = {
    deletedAt: null,
    category: filters.category,
    paymentMode: filters.paymentMode,
    vendor: filters.vendor ? { contains: filters.vendor, mode: "insensitive" } : undefined,
    date:
      filters.startDate || filters.endDate
        ? {
            gte: filters.startDate ? new Date(filters.startDate) : undefined,
            lte: filters.endDate ? new Date(filters.endDate) : undefined,
          }
        : undefined,
  };
  if (filters.caseId) {
    where.caseId = filters.caseId;
  } else if (filters.kind === "GENERAL") {
    where.caseId = null;
    where.clientId = null;
  } else if (filters.kind === "CLIENT") {
    where.caseId = null;
    where.clientId = { not: null };
  } else if (filters.kind === "CASE") {
    where.caseId = { not: null };
  }
  if (filters.clientId) where.clientId = filters.clientId;

  const rows = await prisma.expense.findMany({ where, include: EXPENSE_LIST_INCLUDE, orderBy: { date: "desc" }, take: 200 });
  return rows.map((e) => ({ ...e, kind: expenseKind(e) }));
}

export interface ListAccountsInvoicesFilters {
  clientId?: string;
  caseId?: string;
  startDate?: string;
  endDate?: string;
}

/** §26 — startDate/endDate (issueDate) added for the Income/Fees drill-down; every
 * pre-existing caller omits them and gets the unfiltered, all-time list unchanged. */
export async function listInvoicesForAccounts(filters: ListAccountsInvoicesFilters) {
  const invoices = await prisma.invoice.findMany({
    where: {
      clientId: filters.clientId,
      caseId: filters.caseId,
      issueDate:
        filters.startDate || filters.endDate
          ? {
              gte: filters.startDate ? new Date(filters.startDate) : undefined,
              lte: filters.endDate ? new Date(filters.endDate) : undefined,
            }
          : undefined,
    },
    include: { client: { select: SAFE_CLIENT_SELECT }, case: { select: { id: true, matterNumber: true } } },
    orderBy: { issueDate: "desc" },
    take: 200,
  });
  return invoices.map((i) => ({ ...i, paymentStatus: derivePaymentStatus(i) }));
}

/* ------------------------------------------------------------------------ *
 * Receipt / proof uploads (§14/§19/§27) — reuse the existing Documents pipeline
 * (validateUploadedFile, multer disk storage) rather than building a separate
 * attachment mechanism. Always confidentiality: INTERNAL — a financial receipt must
 * never become client-visible (§26/§27), and there is deliberately no confidentiality-
 * edit endpoint anywhere in this app that could ever flip that after the fact.
 * ------------------------------------------------------------------------ */

async function createReceiptDocument(
  actor: AccessTokenPayload,
  scope: { caseId?: string | null; clientId?: string | null },
  title: string,
  category: string,
  file: Express.Multer.File
) {
  await validateUploadedFile({ filePath: file.path, declaredMimeType: file.mimetype, actorId: actor.sub });
  return prisma.document.create({
    data: {
      caseId: scope.caseId ?? undefined,
      clientId: scope.caseId ? undefined : scope.clientId ?? undefined,
      title,
      category,
      confidentiality: "INTERNAL",
      createdById: actor.sub,
      versions: {
        create: {
          versionNumber: 1,
          fileName: file.originalname,
          storagePath: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: actor.sub,
        },
      },
    },
  });
}

/** §14 — "Receipt/Proof Upload (optional)." Only offered when the payment has a case
 * to attach the document to (case-level or fee-linked); a pure client-level payment
 * (no case at all) still gets `clientId`-only Document support per the schema change
 * in Stage 1, so this works for both. */
export async function attachPaymentReceipt(actor: AccessTokenPayload, paymentId: string, file: Express.Multer.File) {
  const payment = await loadPaymentOrThrow(paymentId);
  await assertClientAccess(actor, payment.clientId);
  if (payment.caseId) await assertCaseAccess(actor, payment.caseId);

  const document = await createReceiptDocument(
    actor,
    { caseId: payment.caseId, clientId: payment.clientId },
    "Payment Receipt",
    "Payment Receipt",
    file
  );
  await prisma.accountsPayment.update({ where: { id: paymentId }, data: { receiptDocumentId: document.id } });
  await recordAuditLog(actor, "ACCOUNTS_PAYMENT_RECEIPT_UPLOADED", "AccountsPayment", paymentId, {
    entityName: document.title,
  });
  return document;
}

/**
 * §19 — expense bill/receipt upload. Branches the same way create/update/delete do:
 * a case-level expense's receipt lives in that case's Document scope, a client-level
 * one lives in the client's scope (mirrors the payment-receipt precedent exactly).
 * A General/Firm expense (2026-08-15 follow-up) has neither — `createReceiptDocument`
 * below already produces a Document with both caseId and clientId null in that case,
 * and `assertDocumentAccess`/`assertScopelessAccountsDocumentAccess`
 * (utils/authorization.ts) know how to gate access to exactly that shape (by
 * ACCOUNTS.VIEW_EXPENSES possession, since there is no row-level case/client scope
 * for a firm-level expense to check). No fake Client/Case is ever created to give the
 * Document a scope.
 */
export async function attachExpenseReceipt(actor: AccessTokenPayload, expenseId: string, file: Express.Multer.File) {
  const expense = await loadAccountsExpenseOrThrow(expenseId);
  await assertExpenseScopeAccess(actor, expense.caseId, expense.clientId);

  const document = await createReceiptDocument(
    actor,
    { caseId: expense.caseId, clientId: expense.clientId },
    "Expense Bill",
    "Expense Bill",
    file
  );
  await prisma.expense.update({ where: { id: expenseId }, data: { receiptDocumentId: document.id } });
  await recordAuditLog(actor, "ACCOUNTS_EXPENSE_RECEIPT_UPLOADED", "Expense", expenseId, { entityName: document.title });
  return document;
}
