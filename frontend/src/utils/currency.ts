/** ACCOUNTS module (2026-08-14) — shared INR formatter, matching the existing
 * `toLocaleString(..., { style: "currency", currency: "INR" })` convention already
 * used on the main Dashboard, factored out since Accounts needs it in ~6 places. */
export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return n.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}
