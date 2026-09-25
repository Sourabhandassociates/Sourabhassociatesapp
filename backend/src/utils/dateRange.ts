import { BadRequestError } from "./errors";

/**
 * ACCOUNTS module (2026-08-14) — §25's date-range presets for Reports (Today/This
 * Week/This Month/Financial Year/Custom). Deliberately a fresh, Accounts-scoped
 * utility rather than a refactor of `causeList.service.ts`'s own local
 * `resolveDateRange` (presets TODAY/TOMORROW/NEXT_7_DAYS/THIS_WEEK/CUSTOM) — that
 * function is unrelated-module code that already works and is already tested; this
 * file does not touch it, matching "do not modify unrelated modules."
 *
 * PREVIOUS_MONTH added for the Accounts Overview completion pass (2026-08-15) — the
 * dashboard's date-range selector needs it alongside the existing five.
 *
 * Financial Year = April 1 – March 31 (the Indian-firm convention already implicit
 * elsewhere in this app, e.g. GST-adjacent invoice numbering).
 *
 * ALL_TIME added for the Accounts Overview period-persistence pass (2026-08-17) —
 * deliberately resolves to `undefined` (no range) rather than an artificial
 * gte/lte pair spanning "forever," because every Accounts query already treats a
 * missing range as unfiltered (the established "no range = unfiltered" convention
 * documented throughout accounts.service.ts) — ALL_TIME simply asks for that same
 * behavior explicitly instead of by omitting the preset entirely, so it can be a
 * real, selectable, persistable option in the UI. No new financial calculation
 * exists for it; it reuses every existing query path unchanged.
 */
export type AccountsDateRangePreset =
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "FINANCIAL_YEAR"
  | "ALL_TIME"
  | "CUSTOM";

export interface ResolvedDateRange {
  gte: Date;
  lte: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function resolveAccountsDateRange(
  preset: AccountsDateRangePreset,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): ResolvedDateRange | undefined {
  if (preset === "ALL_TIME") {
    return undefined;
  }
  if (preset === "TODAY") {
    return { gte: startOfDay(now), lte: endOfDay(now) };
  }
  if (preset === "THIS_WEEK") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { gte: startOfDay(monday), lte: endOfDay(sunday) };
  }
  if (preset === "THIS_MONTH") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { gte: startOfDay(first), lte: endOfDay(last) };
  }
  if (preset === "PREVIOUS_MONTH") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { gte: startOfDay(first), lte: endOfDay(last) };
  }
  if (preset === "FINANCIAL_YEAR") {
    // April 1 of the current FY (if today is Jan-Mar, the FY started last calendar year).
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const start = new Date(fyStartYear, 3, 1);
    const end = new Date(fyStartYear + 1, 2, 31);
    return { gte: startOfDay(start), lte: endOfDay(end) };
  }
  // CUSTOM
  if (!customStart || !customEnd) throw new BadRequestError("Custom date range requires both startDate and endDate");
  const gte = new Date(customStart);
  const lte = new Date(customEnd);
  if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) throw new BadRequestError("Invalid custom date range");
  return { gte: startOfDay(gte), lte: endOfDay(lte) };
}
