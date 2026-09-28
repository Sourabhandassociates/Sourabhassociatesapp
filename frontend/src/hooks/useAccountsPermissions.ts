import { useEffect, useState } from "react";
import { api } from "../api/client";

/** ACCOUNTS module (2026-08-14). The 14-flag boolean map from GET /accounts/permissions
 * — drives sidebar/tab/button visibility for the current staff actor. Fetched fresh on
 * every mount (no caching), matching this app's existing "fetch on navigation" pattern
 * (e.g. ClientPortalDashboard's `/client-portal/me`) rather than a global cache — a
 * Managing Partner permission change is reflected the next time this hook re-mounts,
 * with no polling/websocket needed. Never used for enforcement, only display — every
 * backend route re-checks the real permission independently. */
export interface AccountsPermissions {
  view: boolean;
  createPayment: boolean;
  editPayment: boolean;
  deletePayment: boolean;
  viewExpenses: boolean;
  createExpense: boolean;
  editExpense: boolean;
  deleteExpense: boolean;
  viewInvoice: boolean;
  createInvoice: boolean;
  editInvoice: boolean;
  deleteInvoice: boolean;
  viewReports: boolean;
  manageFee: boolean;
}

const EMPTY: AccountsPermissions = {
  view: false,
  createPayment: false,
  editPayment: false,
  deletePayment: false,
  viewExpenses: false,
  createExpense: false,
  editExpense: false,
  deleteExpense: false,
  viewInvoice: false,
  createInvoice: false,
  editInvoice: false,
  deleteInvoice: false,
  viewReports: false,
  manageFee: false,
};

export function useAccountsPermissions() {
  const [permissions, setPermissions] = useState<AccountsPermissions>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<AccountsPermissions>("/accounts/permissions")
      .then((res) => {
        if (!cancelled) setPermissions(res.data);
      })
      .catch(() => {
        if (!cancelled) setPermissions(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { permissions, loading };
}
