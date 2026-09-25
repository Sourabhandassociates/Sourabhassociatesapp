import { InvoiceStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors";
import { assertCaseAccess, assertClientAccess } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { notifyCaseTeam } from "../../utils/notify";
import { generateInvoiceNumber } from "../../utils/idGenerator";
import { AccessTokenPayload } from "../../utils/jwt";

const SAFE_CLIENT_SELECT = { id: true, clientId: true, name: true, email: true, phone: true, address: true } as const;
const SAFE_CASE_SELECT = { id: true, matterNumber: true, title: true, courtName: true, practiceArea: true } as const;

/**
 * SRD Section 16.1 — auto-draft invoice generation aggregating logged hours + manual
 * line items. A time log's rate is supplied here (not stored on the TimeLog itself),
 * since the SRD's "configurable billing models (hourly/fixed-fee/retainer)" implies
 * the rate can vary per engagement, not just per user — kept simple and explicit
 * rather than adding a firm-wide rate table this milestone doesn't otherwise need.
 *
 * `caseId` is optional as of the invoice-module completion pass (2026-08-06) — a
 * "general" invoice billed directly to a client, not tied to any matter, from the
 * dedicated Create Invoice screen. **The case-scoped path below is byte-for-byte the
 * same validation the Case Billing tab has always gone through** — this is a strict
 * additive branch, not a rewrite, so that existing workflow is guaranteed unchanged.
 */
export interface CreateInvoiceInput {
  caseId?: string;
  clientId: string;
  issueDate?: string;
  dueDate?: string;
  timeLogItems?: { timeLogId: string; rate: number }[];
  expenseItems?: { expenseId: string }[];
  manualItems?: { description: string; quantity: number; rate: number }[];
  /** Percentage, e.g. 18 for 18% GST. */
  taxRate?: number;
  discountType?: "PERCENTAGE" | "FLAT";
  discountValue?: number;
  notes?: string;
  termsAndConditions?: string;
}

export async function createDraftInvoice(actor: AccessTokenPayload, input: CreateInvoiceInput) {
  const timeLogItems = input.timeLogItems ?? [];
  const expenseItems = input.expenseItems ?? [];
  const manualItems = input.manualItems ?? [];

  if (input.caseId) {
    // Unchanged from the original Case Billing implementation — see the module doc
    // comment above.
    await assertCaseAccess(actor, input.caseId);
    const clientLink = await prisma.caseClient.findFirst({ where: { caseId: input.caseId, clientId: input.clientId } });
    if (!clientLink) throw new BadRequestError("clientId must be linked to this case");
  } else {
    // General invoice — no case to link the client through, so the client's own
    // row-level access check stands in for it (same guarantee: the actor can't bill
    // a client they can't otherwise see).
    if (timeLogItems.length > 0 || expenseItems.length > 0) {
      throw new BadRequestError("Time logs and expenses can only be invoiced against their own case");
    }
    await assertClientAccess(actor, input.clientId);
  }

  if (timeLogItems.length + expenseItems.length + manualItems.length === 0) {
    throw new BadRequestError("An invoice needs at least one line item");
  }

  const timeLogs = input.caseId
    ? await prisma.timeLog.findMany({
        where: { id: { in: timeLogItems.map((t) => t.timeLogId) }, caseId: input.caseId, invoiced: false },
      })
    : [];
  if (timeLogs.length !== timeLogItems.length) {
    throw new BadRequestError("One or more time logs are invalid, already invoiced, or don't belong to this case");
  }

  const expenses = input.caseId
    ? await prisma.expense.findMany({
        where: {
          id: { in: expenseItems.map((e) => e.expenseId) },
          caseId: input.caseId,
          invoiced: false,
          deletedAt: null,
          billableToClient: true,
        },
      })
    : [];
  if (expenses.length !== expenseItems.length) {
    throw new BadRequestError("One or more expenses are invalid, already invoiced, not billable, or don't belong to this case");
  }

  const lineItemsData: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    timeLogId?: string;
    expenseId?: string;
  }[] = [];

  for (const item of timeLogItems) {
    if (item.rate <= 0) throw new BadRequestError("Rate must be greater than zero");
    const log = timeLogs.find((t) => t.id === item.timeLogId)!;
    lineItemsData.push({
      description: log.description || `Time entry (${log.date.toISOString().slice(0, 10)})`,
      quantity: log.hours,
      rate: item.rate,
      amount: log.hours * item.rate,
      timeLogId: log.id,
    });
  }
  for (const item of expenseItems) {
    const expense = expenses.find((e) => e.id === item.expenseId)!;
    lineItemsData.push({
      description: `${expense.category} expense (${expense.date.toISOString().slice(0, 10)})`,
      quantity: 1,
      rate: expense.amount,
      amount: expense.amount,
      expenseId: expense.id,
    });
  }
  for (const item of manualItems) {
    if (item.quantity <= 0 || item.rate <= 0) throw new BadRequestError("Quantity and rate must be greater than zero");
    lineItemsData.push({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.quantity * item.rate,
    });
  }

  const subtotal = lineItemsData.reduce((sum, li) => sum + li.amount, 0);
  const { discountAmount, taxAmount, total } = computeInvoiceTotals(subtotal, input);
  const invoiceNumber = await generateInvoiceNumber();

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        caseId: input.caseId,
        clientId: input.clientId,
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        subtotal,
        taxRate: input.taxRate ?? 0,
        taxAmount,
        discountType: input.discountType,
        discountValue: input.discountValue ?? 0,
        discountAmount,
        notes: input.notes,
        termsAndConditions: input.termsAndConditions,
        total,
        createdById: actor.sub,
        lineItems: { create: lineItemsData },
      },
      include: { lineItems: true, case: { select: SAFE_CASE_SELECT }, client: { select: SAFE_CLIENT_SELECT } },
    });

    if (timeLogItems.length > 0) {
      await tx.timeLog.updateMany({
        where: { id: { in: timeLogItems.map((t) => t.timeLogId) } },
        data: { invoiced: true },
      });
    }
    if (expenseItems.length > 0) {
      await tx.expense.updateMany({
        where: { id: { in: expenseItems.map((e) => e.expenseId) } },
        data: { invoiced: true },
      });
    }
    return created;
  });

  await recordAuditLog(actor, "INVOICE_CREATED", "Invoice", invoice.id, {
    entityName: invoice.invoiceNumber,
    details: `Total: ${invoice.total}`,
  });

  // Milestone 3 (SRD Section 17) — "invoice generated" trigger. No case team to
  // notify for a general invoice.
  if (input.caseId) {
    await notifyCaseTeam(input.caseId, "INVOICE_GENERATED", `Invoice ${invoice.invoiceNumber} was generated`, actor.sub);
  }

  return withPaymentStatus(invoice);
}

/** Discount applies to the subtotal; tax applies to the post-discount amount — the
 * standard order for an Indian GST invoice (discount, then GST on the discounted
 * value). A flat discount is clamped to the subtotal so a typo can never produce a
 * negative total. */
function computeInvoiceTotals(
  subtotal: number,
  input: { discountType?: "PERCENTAGE" | "FLAT"; discountValue?: number; taxRate?: number }
): { discountAmount: number; taxAmount: number; total: number } {
  const discountValue = input.discountValue ?? 0;
  let discountAmount = 0;
  if (input.discountType === "PERCENTAGE") {
    discountAmount = subtotal * (discountValue / 100);
  } else if (input.discountType === "FLAT") {
    discountAmount = Math.min(discountValue, subtotal);
  }
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * ((input.taxRate ?? 0) / 100);
  const total = taxableAmount + taxAmount;
  return { discountAmount, taxAmount, total };
}

/**
 * Billing bug-fix follow-up (2026-08-06) — the SRD's payment-status badges (Pending/
 * Partially Paid/Paid/Overdue) are a distinct axis from `Invoice.status` (the
 * DRAFT→APPROVED→SENT lifecycle, plus PARTIALLY_PAID/PAID which *are* already stored
 * and derived from the payment ledger in `recordPayment`). `OVERDUE` exists as an
 * `InvoiceStatus` enum value but is never written anywhere — the same "computed on
 * read, not a scheduled job" pattern this codebase already uses for
 * `Task.isOverdue` (see `tasks.service.ts`'s `listAllTasks`) is applied here instead
 * of adding a cron job this deployment has no infrastructure for. A fully-paid
 * invoice is never "overdue" regardless of due date; everything else past its due
 * date is, taking precedence over the plain PARTIALLY_PAID/pending distinction —
 * matching how billing software conventionally treats "overdue" as the union of
 * unpaid and partially-paid-but-late.
 */
export type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export function derivePaymentStatus(invoice: { status: InvoiceStatus; dueDate: Date | null }): PaymentStatus {
  if (invoice.status === "PAID") return "PAID";
  if (invoice.dueDate && invoice.dueDate.getTime() < Date.now()) return "OVERDUE";
  if (invoice.status === "PARTIALLY_PAID") return "PARTIALLY_PAID";
  return "PENDING";
}

function withPaymentStatus<T extends { status: InvoiceStatus; dueDate: Date | null }>(invoice: T): T & { paymentStatus: PaymentStatus } {
  return { ...invoice, paymentStatus: derivePaymentStatus(invoice) };
}

/**
 * SRD Section 16.1's matrix split — "View/pay invoices" (Managing Partner/Accounts
 * Team only) is a different, narrower row than "Create/edit invoices" (Associate can
 * draft). Firm-wide by design, matching Accounts Team's "full read/write access to
 * Billing & Invoicing ... across all cases/clients" (Section 3.5) — no row-level case
 * scoping beyond the BILLING.VIEW permission gate itself.
 */
export interface ListInvoicesFilters {
  caseId?: string;
  clientId?: string;
  status?: string;
  /** Derived payment-status filter (Pending/Partially Paid/Paid/Overdue) — combines
   * with `status`/`caseId`/`clientId` above via a plain AND, same as every other
   * filter on this endpoint. Applied in application code after the DB query since
   * it depends on `dueDate` vs. "now", not a column any WHERE clause can express
   * directly. */
  paymentStatus?: PaymentStatus;
}

export async function listInvoices(filters: ListInvoicesFilters) {
  const invoices = await prisma.invoice.findMany({
    where: {
      caseId: filters.caseId,
      clientId: filters.clientId,
      status: filters.status as InvoiceStatus | undefined,
    },
    include: { case: { select: SAFE_CASE_SELECT }, client: { select: SAFE_CLIENT_SELECT }, payments: true },
    orderBy: { issueDate: "desc" },
  });
  const withStatus = invoices.map(withPaymentStatus);
  return filters.paymentStatus ? withStatus.filter((inv) => inv.paymentStatus === filters.paymentStatus) : withStatus;
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      case: { select: SAFE_CASE_SELECT },
      client: { select: SAFE_CLIENT_SELECT },
      lineItems: true,
      payments: { orderBy: { paidAt: "asc" } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found");
  return withPaymentStatus(invoice);
}

/** Draft → Partner Review/Approve → Sent (SRD Section 16.1), Managing-Partner-only
 * (BILLING.APPROVE) at both transitions. */
export async function approveInvoice(actor: AccessTokenPayload, id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (invoice.status !== "DRAFT") throw new BadRequestError("Only a draft invoice can be approved");

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "APPROVED", approvedById: actor.sub, approvedAt: new Date() },
  });
  await recordAuditLog(actor, "INVOICE_APPROVED", "Invoice", id, { entityName: updated.invoiceNumber });
  return withPaymentStatus(updated);
}

export async function sendInvoice(actor: AccessTokenPayload, id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (invoice.status !== "APPROVED") throw new BadRequestError("Only an approved invoice can be sent");

  const updated = await prisma.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await recordAuditLog(actor, "INVOICE_SENT", "Invoice", id, { entityName: updated.invoiceNumber });
  return withPaymentStatus(updated);
}

/** SRD Section 16.1 — payment tracking, supports partial payments. Status derives
 * from the sum of recorded payments rather than being set independently, so it can
 * never drift out of sync with the actual ledger. */
export interface RecordPaymentInput {
  amount: number;
  method?: string;
}

export async function recordPayment(actor: AccessTokenPayload, invoiceId: string, input: RecordPaymentInput) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (!["APPROVED", "SENT", "PARTIALLY_PAID"].includes(invoice.status)) {
    throw new BadRequestError("Payments can only be recorded against an approved, sent, or partially-paid invoice");
  }
  if (input.amount <= 0) throw new BadRequestError("Amount must be greater than zero");

  const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.total - alreadyPaid;
  const EPSILON = 0.01;
  if (input.amount > remaining + EPSILON) {
    throw new BadRequestError(`Payment amount exceeds the remaining balance of ${remaining.toFixed(2)}`);
  }

  const payment = await prisma.payment.create({
    data: { invoiceId, amount: input.amount, method: input.method, recordedById: actor.sub },
  });

  const newPaidTotal = alreadyPaid + input.amount;
  const newStatus: InvoiceStatus = newPaidTotal >= invoice.total - EPSILON ? "PAID" : "PARTIALLY_PAID";
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });

  await recordAuditLog(actor, "PAYMENT_RECORDED", "Invoice", invoiceId, {
    entityName: invoice.invoiceNumber,
    details: `+${input.amount}`,
  });

  // Milestone 3 (SRD Section 17) — "invoice paid" trigger, only on the transition to
  // fully PAID. No case team to notify for a general (no-case) invoice.
  if (newStatus === "PAID" && invoice.caseId) {
    await notifyCaseTeam(invoice.caseId, "INVOICE_PAID", `Invoice ${invoice.invoiceNumber} has been fully paid`, actor.sub);
  }

  return payment;
}

/**
 * ACCOUNTS module (2026-08-14, §23) — the invoice module had no edit/delete endpoint
 * at all before this pass (only create-draft/approve/send/record-payment). Scoped
 * deliberately narrow: DRAFT-only, and only the fields that carry no downstream
 * consequence (notes/terms/due date) — never line items or totals, which would
 * require re-deriving `subtotal`/`taxAmount`/`total` and risk drifting from what a
 * later-approved invoice actually says. Gated by ACCOUNTS.EDIT_INVOICE alone (a new
 * capability, not a tightening of the pre-existing BILLING.* gates on the routes
 * above).
 */
export interface EditInvoiceInput {
  notes?: string;
  termsAndConditions?: string;
  dueDate?: string | null;
}

export async function editInvoice(actor: AccessTokenPayload, id: string, input: EditInvoiceInput) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (invoice.status !== "DRAFT") throw new ConflictError("Only a draft invoice can be edited");

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      notes: input.notes,
      termsAndConditions: input.termsAndConditions,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
    },
  });

  const changes = diffObjects(invoice, updated, ["notes", "termsAndConditions", "dueDate"]);
  if (changes) {
    await recordAuditLog(actor, "ACCOUNTS_INVOICE_EDITED", "Invoice", id, { entityName: updated.invoiceNumber, changes });
  }
  return withPaymentStatus(updated);
}

/** DRAFT-only, hard delete (never sent, no financial weight yet — a genuine mistake
 * to discard, not a record to preserve). Blocked if any Payment row somehow
 * references it, though today that can't happen (recordPayment only accepts
 * APPROVED/SENT/PARTIALLY_PAID invoices). */
export async function deleteInvoice(actor: AccessTokenPayload, id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, lineItems: true } });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (invoice.status !== "DRAFT") throw new ConflictError("Only a draft invoice can be deleted");
  if (invoice.payments.length > 0) throw new ConflictError("This invoice has recorded payments and cannot be deleted");

  const timeLogIds = invoice.lineItems.map((li) => li.timeLogId).filter((v): v is string => v !== null);
  const expenseIds = invoice.lineItems.map((li) => li.expenseId).filter((v): v is string => v !== null);

  await prisma.$transaction(async (tx) => {
    // Un-invoice the underlying time logs/expenses so a deleted draft doesn't
    // permanently block them from being invoiced again (InvoiceLineItem rows
    // themselves cascade-delete with the invoice below).
    if (timeLogIds.length > 0) await tx.timeLog.updateMany({ where: { id: { in: timeLogIds } }, data: { invoiced: false } });
    if (expenseIds.length > 0) await tx.expense.updateMany({ where: { id: { in: expenseIds } }, data: { invoiced: false } });
    await tx.invoice.delete({ where: { id } });
  });

  await recordAuditLog(actor, "ACCOUNTS_INVOICE_DELETED", "Invoice", id, { entityName: invoice.invoiceNumber });
}
