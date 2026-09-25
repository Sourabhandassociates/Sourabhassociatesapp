import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

/**
 * ACCOUNTS module (2026-08-14) — the Outstanding/Overdue/Due Soon math. Follows the
 * exact same shape as invoices.service.ts's `derivePaymentStatus`/`withPaymentStatus`
 * (a pure function comparing pre-fetched data to `now`, applied at read time — never a
 * stored column, never a cron job), with one necessary addition: Decimal arithmetic
 * throughout, since this is money and the Managing Partner's spec explicitly forbids
 * floating-point arithmetic for financial calculations.
 *
 * Kept in its own file, separate from accounts.service.ts, so this — the highest-risk
 * business logic in the whole module — is isolated and easy to unit-test independent
 * of Express/Prisma-transaction concerns.
 */

export const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface FeeFinancials {
  feeId: string;
  amount: Prisma.Decimal;
  received: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  isOverdue: boolean;
  isDueSoon: boolean;
  daysOverdue: number | null;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Sums non-deleted AccountsPayment rows applied to a set of fee ids, DB-side (never
 * JS float addition on money). Only fee-linked payments ever appear here — a
 * client-level payment (feeId null) or case-level-unallocated payment (caseId set,
 * feeId null) never reduces any fee's outstanding, by construction (this function
 * simply never sees them), even though both still count toward the firm-wide/
 * client-wide/case-wide "total received" figure computed separately.
 */
export async function receivedByFeeId(feeIds: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (feeIds.length === 0) return new Map();
  const grouped = await prisma.accountsPayment.groupBy({
    by: ["feeId"],
    where: { feeId: { in: feeIds }, deletedAt: null },
    _sum: { amount: true },
  });
  const map = new Map<string, Prisma.Decimal>();
  for (const row of grouped) {
    if (row.feeId) map.set(row.feeId, row._sum.amount ?? ZERO);
  }
  return map;
}

export function deriveFeeFinancials(
  fee: { id: string; amount: Prisma.Decimal; dueDate: Date | null },
  received: Prisma.Decimal,
  now: Date = new Date()
): FeeFinancials {
  const outstanding = fee.amount.minus(received);
  const isPositiveOutstanding = outstanding.greaterThan(0);
  const hasDueDate = fee.dueDate !== null;
  const isPastDue = hasDueDate && fee.dueDate!.getTime() < now.getTime();
  const isOverdue = isPositiveOutstanding && isPastDue;
  const isDueSoon =
    isPositiveOutstanding && hasDueDate && !isPastDue && fee.dueDate!.getTime() <= now.getTime() + DUE_SOON_WINDOW_MS;
  const daysOverdue = isOverdue ? Math.floor((now.getTime() - fee.dueDate!.getTime()) / (24 * 60 * 60 * 1000)) : null;

  return { feeId: fee.id, amount: fee.amount, received, outstanding, isOverdue, isDueSoon, daysOverdue };
}

/** Fetches every non-deleted fee matching `where` plus its financials, in one batched
 * pass (one query for fees, one grouped query for payments — never N+1). */
export async function financialsForFees(
  where: Prisma.ProfessionalFeeWhereInput,
  now: Date = new Date()
): Promise<(FeeFinancials & { clientId: string; caseId: string | null })[]> {
  const fees = await prisma.professionalFee.findMany({
    where: { ...where, deletedAt: null },
    select: { id: true, amount: true, dueDate: true, clientId: true, caseId: true },
  });
  const receivedMap = await receivedByFeeId(fees.map((f) => f.id));
  return fees.map((fee) => ({
    ...deriveFeeFinancials(fee, receivedMap.get(fee.id) ?? ZERO, now),
    clientId: fee.clientId,
    caseId: fee.caseId,
  }));
}

export function sumDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((sum, v) => sum.plus(v), ZERO);
}
