import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useAccountsPermissions } from "../../hooks/useAccountsPermissions";
import { useAuth } from "../../context/useAuth";
import { AccountsSearch } from "./AccountsSearch";
import { PaymentList } from "./Payments/PaymentList";
import { ExpensesPanel } from "./Expenses/ExpensesPanel";
import { InvoicesPanel } from "./Invoices/InvoicesPanel";
import { ReportsPanel } from "./Reports/ReportsPanel";

interface DashboardData {
  range: { start: string; end: string } | null;
  totalIncome: number;
  received: number;
  outstanding: number;
  totalExpenses: number;
  profit: number;
  breakdown: {
    totalIncome: number;
    overdue: number;
    incomeAfterOverdue: number;
    generalExpenses: number;
    clientExpenses: number;
    caseExpenses: number;
    totalExpenses: number;
    profit: number;
  };
  dueSoonWindowDays: number;
}

interface OverdueRow {
  feeId: string;
  clientName: string;
  clientId: string;
  caseNumber: string | null;
  matterNumber: string | null;
  professionalFee: number;
  amountReceived: number;
  outstanding: number;
  daysOverdue: number | null;
  lastPaymentDate: string | null;
  assignedAdvocate: string | null;
}

interface DueSoonRow {
  feeId: string;
  clientName: string;
  clientId: string;
  caseNumber: string | null;
  matterNumber: string | null;
  professionalFee: number;
  amountReceived: number;
  outstanding: number;
  assignedAdvocate: string | null;
}

interface FeeRow {
  id: string;
  amount: number;
  received: number;
  outstanding: number;
  isOverdue: boolean;
  isDueSoon: boolean;
  client?: { name: string; clientId: string };
  case?: { matterNumber: string } | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  total: number;
  issueDate: string;
  status: string;
  client: { name: string; clientId: string };
  case: { matterNumber: string } | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  paymentDate: string;
  mode: string;
  client: { name: string; clientId: string };
  case: { matterNumber: string } | null;
}

interface ExpenseRow {
  id: string;
  kind: "GENERAL" | "CLIENT" | "CASE";
  category: string;
  amount: number;
  date: string;
  vendor: string | null;
  client: { name: string; clientId: string } | null;
  case: { matterNumber: string } | null;
}

type Section = "overview" | "search" | "payments" | "expenses" | "invoices" | "reports";
type Preset = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "PREVIOUS_MONTH" | "FINANCIAL_YEAR" | "ALL_TIME" | "CUSTOM";
type Drill = "income" | "received" | "outstanding" | "expenses" | "profit" | "overdue" | "dueSoon" | null;

const DEFAULT_PRESET: Preset = "THIS_MONTH";
const PRESET_LABELS: { value: Preset; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This Week" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "PREVIOUS_MONTH", label: "Previous Month" },
  { value: "FINANCIAL_YEAR", label: "This Financial Year" },
  { value: "ALL_TIME", label: "All Time" },
  { value: "CUSTOM", label: "Custom Range" },
];
const PRESET_VALUES = PRESET_LABELS.map((p) => p.value);

/**
 * Accounts Overview period persistence (2026-08-17). The selected Period
 * (preset + custom dates, if any) is remembered across navigation using
 * localStorage, namespaced by the authenticated staff user's own id (§11 — so
 * one staff member's saved period never appears for another on a shared
 * browser), matching the app's existing preference-storage convention
 * (components/Layout.tsx's sidebar width/collapsed prefs). Only the UI
 * preference itself is stored here — never any fetched financial figures (§10).
 */
interface SavedPeriod {
  preset: Preset;
  customStart: string;
  customEnd: string;
}

function periodStorageKey(userId: string | undefined): string {
  return userId ? `accounts.overview.period.${userId}` : "accounts.overview.period";
}

function loadSavedPeriod(userId: string | undefined): SavedPeriod {
  try {
    const raw = localStorage.getItem(periodStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (PRESET_VALUES.includes(parsed.preset)) {
        return {
          preset: parsed.preset,
          customStart: typeof parsed.customStart === "string" ? parsed.customStart : "",
          customEnd: typeof parsed.customEnd === "string" ? parsed.customEnd : "",
        };
      }
    }
  } catch {
    // corrupt/unavailable storage — fall through to the default period
  }
  return { preset: DEFAULT_PRESET, customStart: "", customEnd: "" };
}

function saveSelectedPeriod(userId: string | undefined, period: SavedPeriod) {
  try {
    localStorage.setItem(periodStorageKey(userId), JSON.stringify(period));
  } catch {
    // localStorage unavailable (private browsing, quota) — persistence is a
    // convenience, never required for the dashboard to function.
  }
}

function formatPeriodDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** ACCOUNTS module — Overview completion pass (2026-08-15). Five cards only (Total
 * Income/Fees, Received, Outstanding, Total Expenses, Profit), a date-range
 * selector that every card respects, and click-through drill-downs (§25). Overdue/
 * Due Soon are no longer cards but stay one click away via the two links below the
 * cards, reusing the exact same drill-down data/handlers the old card-based
 * version used. */
export default function Accounts() {
  const { auth } = useAuth();
  const { permissions, loading } = useAccountsPermissions();
  const [section, setSection] = useState<Section>("overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  // Period persistence (2026-08-17) — lazily initialized from localStorage once,
  // at mount, rather than always starting at DEFAULT_PRESET and correcting
  // afterward, so the very first render (and the very first dashboard fetch)
  // already uses the user's last saved period — never a flash of "This Month"
  // before snapping to the real saved value.
  const [preset, setPreset] = useState<Preset>(() => loadSavedPeriod(auth?.id).preset);
  const [customStart, setCustomStart] = useState(() => loadSavedPeriod(auth?.id).customStart);
  const [customEnd, setCustomEnd] = useState(() => loadSavedPeriod(auth?.id).customEnd);
  const [drill, setDrill] = useState<Drill>(null);
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [dueSoonRows, setDueSoonRows] = useState<DueSoonRow[]>([]);
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);

  const rangeReady = preset !== "CUSTOM" || (customStart && customEnd);
  const rangeParams = rangeReady ? { preset, startDate: preset === "CUSTOM" ? customStart : undefined, endDate: preset === "CUSTOM" ? customEnd : undefined } : null;

  /** Persists the selected period immediately on every change (§2/§9) — never
   * only on unmount/navigation, so even a browser refresh mid-session keeps the
   * latest selection. Never writes any fetched financial data, only the three
   * plain UI-preference fields (§10). */
  useEffect(() => {
    saveSelectedPeriod(auth?.id, { preset, customStart, customEnd });
  }, [auth?.id, preset, customStart, customEnd]);

  /** Refetches whenever the user lands on Overview (including the initial mount)
   * or changes the date range — no polling, no background timer, no extra request
   * while on any other tab. */
  useEffect(() => {
    if (!permissions.view) return;
    if (section !== "overview") return;
    if (!rangeParams) return;
    api.get<DashboardData>("/accounts/dashboard", { params: rangeParams }).then((res) => setDashboard(res.data));
    setDrill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.view, section, preset, customStart, customEnd]);

  function resetDateFilter() {
    setPreset(DEFAULT_PRESET);
    setCustomStart("");
    setCustomEnd("");
  }

  function openOverdue() {
    setDrill("overdue");
    api.get<OverdueRow[]>("/accounts/overdue").then((res) => setOverdueRows(res.data));
  }
  function openDueSoon() {
    setDrill("dueSoon");
    api.get<DueSoonRow[]>("/accounts/due-soon").then((res) => setDueSoonRows(res.data));
  }
  function openIncome() {
    setDrill("income");
    if (!rangeParams) return;
    const dateParams = { startDate: dashboard?.range?.start, endDate: dashboard?.range?.end };
    api.get<FeeRow[]>("/accounts/fees", { params: dateParams }).then((res) => setFeeRows(res.data));
    api.get<InvoiceRow[]>("/accounts/invoices", { params: dateParams }).then((res) => setInvoiceRows(res.data));
  }
  function openOutstanding() {
    setDrill("outstanding");
    const dateParams = { startDate: dashboard?.range?.start, endDate: dashboard?.range?.end };
    api.get<FeeRow[]>("/accounts/fees", { params: dateParams }).then((res) => setFeeRows(res.data));
  }
  function openReceived() {
    setDrill("received");
    const dateParams = { startDate: dashboard?.range?.start, endDate: dashboard?.range?.end };
    api.get<PaymentRow[]>("/accounts/payments", { params: dateParams }).then((res) => setPaymentRows(res.data));
  }
  function openExpenses() {
    setDrill("expenses");
    const dateParams = { startDate: dashboard?.range?.start, endDate: dashboard?.range?.end };
    api.get<ExpenseRow[]>("/accounts/expenses", { params: dateParams }).then((res) => setExpenseRows(res.data));
  }
  function openProfit() {
    setDrill("profit");
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!permissions.view) {
    return (
      <div className="card">
        <p className="muted">You do not have access to Accounts. Contact your Managing Partner if you believe this is a mistake.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>ACCOUNTS</h1>
      </div>

      <div className="tab-row" style={{ maxWidth: 720 }}>
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>
          Overview
        </button>
        <button className={section === "search" ? "active" : ""} onClick={() => setSection("search")}>
          Clients / Cases
        </button>
        <button className={section === "payments" ? "active" : ""} onClick={() => setSection("payments")}>
          Payments
        </button>
        {permissions.viewExpenses && (
          <button className={section === "expenses" ? "active" : ""} onClick={() => setSection("expenses")}>
            Expenses
          </button>
        )}
        {permissions.viewInvoice && (
          <button className={section === "invoices" ? "active" : ""} onClick={() => setSection("invoices")}>
            Invoices
          </button>
        )}
        {permissions.viewReports && (
          <button className={section === "reports" ? "active" : ""} onClick={() => setSection("reports")}>
            Reports
          </button>
        )}
      </div>

      {section === "overview" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label>Period</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                {PRESET_LABELS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {preset === "CUSTOM" && (
              <>
                <div>
                  <label>From</label>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label>To</label>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </>
            )}
            <button className="secondary" onClick={resetDateFilter}>
              Reset Date Filter
            </button>
            {/* §8 — the currently active period is always shown, independent of
                whether the dashboard fetch has completed yet, and independent of
                whether the active preset resolves to a concrete date range
                (All Time never has one). */}
            <p className="muted" style={{ margin: 0 }}>
              Period: {PRESET_LABELS.find((p) => p.value === preset)?.label}
              {preset === "CUSTOM" && customStart && customEnd && (
                <> · {formatPeriodDate(customStart)} – {formatPeriodDate(customEnd)}</>
              )}
            </p>
          </div>

          {dashboard && (
            <>
              <div className="dashboard-grid" style={{ marginBottom: 12 }}>
                <div className="stat-tile" onClick={openIncome} style={{ cursor: "pointer" }}>
                  <div className="value">{formatCurrency(dashboard.totalIncome)}</div>
                  <div className="label">Total Income / Fees</div>
                </div>
                <div className="stat-tile" onClick={openReceived} style={{ cursor: "pointer" }}>
                  <div className="value">{formatCurrency(dashboard.received)}</div>
                  <div className="label">Received</div>
                </div>
                <div className="stat-tile" onClick={openOutstanding} style={{ cursor: "pointer" }}>
                  <div className="value">{formatCurrency(dashboard.outstanding)}</div>
                  <div className="label">Outstanding</div>
                </div>
                <div className="stat-tile" onClick={openExpenses} style={{ cursor: "pointer" }}>
                  <div className="value">{formatCurrency(dashboard.totalExpenses)}</div>
                  <div className="label">Total Expenses</div>
                </div>
                <div className="stat-tile" onClick={openProfit} style={{ cursor: "pointer" }}>
                  <div className="value">{formatCurrency(dashboard.profit)}</div>
                  <div className="label">Profit</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                <a href="#overdue" className="clickable" onClick={(e) => { e.preventDefault(); openOverdue(); }}>
                  View Overdue Payments →
                </a>
                <a href="#due-soon" className="clickable" onClick={(e) => { e.preventDefault(); openDueSoon(); }}>
                  View Due Soon →
                </a>
              </div>
            </>
          )}

          {drill === "income" && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Total Income / Fees — Details</h3>
              <h4>Professional Fees</h4>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Case</th>
                      <th>Fee</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRows.map((f) => (
                      <tr key={f.id}>
                        <td>{f.client ? `${f.client.name} (${f.client.clientId})` : "—"}</td>
                        <td>{f.case?.matterNumber ?? "Client-level"}</td>
                        <td>{formatCurrency(f.amount)}</td>
                        <td>{formatCurrency(f.outstanding)}</td>
                      </tr>
                    ))}
                    {feeRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No fees for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <h4 style={{ marginTop: 16 }}>Invoices (non-draft)</h4>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Client</th>
                      <th>Case</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows
                      .filter((i) => i.status !== "DRAFT")
                      .map((i) => (
                        <tr key={i.id}>
                          <td>{i.invoiceNumber}</td>
                          <td>{i.client.name}</td>
                          <td>{i.case?.matterNumber ?? "General"}</td>
                          <td>{formatCurrency(i.total)}</td>
                          <td>{i.status}</td>
                        </tr>
                      ))}
                    {invoiceRows.filter((i) => i.status !== "DRAFT").length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No non-draft invoices for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {drill === "outstanding" && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Outstanding — Details</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Case</th>
                      <th>Fee</th>
                      <th>Received</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRows
                      .filter((f) => f.outstanding > 0)
                      .map((f) => (
                        <tr key={f.id}>
                          <td>{f.client ? `${f.client.name} (${f.client.clientId})` : "—"}</td>
                          <td>{f.case?.matterNumber ?? "Client-level"}</td>
                          <td>{formatCurrency(f.amount)}</td>
                          <td>{formatCurrency(f.received)}</td>
                          <td>{formatCurrency(f.outstanding)}</td>
                        </tr>
                      ))}
                    {feeRows.filter((f) => f.outstanding > 0).length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          Nothing outstanding for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {drill === "received" && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Received — Payment History</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Case</th>
                      <th>Amount</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((p) => (
                      <tr key={p.id}>
                        <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                        <td>{p.client.name}</td>
                        <td>{p.case?.matterNumber ?? "Client-level"}</td>
                        <td>{formatCurrency(p.amount)}</td>
                        <td>{p.mode.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                    {paymentRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No payments for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {drill === "expenses" && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Total Expenses — All Expenses This Period</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Client</th>
                      <th>Case</th>
                      <th>Category</th>
                      <th>Vendor</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRows.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.date).toLocaleDateString()}</td>
                        <td>{e.kind === "GENERAL" ? "General / Firm" : e.kind === "CLIENT" ? "Client-Level" : "Case-Level"}</td>
                        <td>{e.client?.name ?? "—"}</td>
                        <td>{e.case?.matterNumber ?? "—"}</td>
                        <td>{e.category}</td>
                        <td>{e.vendor ?? "—"}</td>
                        <td>{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                    {expenseRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted">
                          No expenses for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {drill === "profit" && dashboard && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Profit Breakdown</h3>
              <p className="muted">
                Selected Period: {PRESET_LABELS.find((p) => p.value === preset)?.label}
                {preset === "CUSTOM" && customStart && customEnd && (
                  <> · {formatPeriodDate(customStart)} – {formatPeriodDate(customEnd)}</>
                )}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 8, maxWidth: 420 }}>
                <div>Total Income / Fees</div>
                <div>{formatCurrency(dashboard.breakdown.totalIncome)}</div>
                <div>Less: Overdue</div>
                <div>− {formatCurrency(dashboard.breakdown.overdue)}</div>
                <div style={{ fontWeight: 600, borderTop: "1px solid var(--color-border)", paddingTop: 6 }}>
                  Income after Overdue
                </div>
                <div style={{ fontWeight: 600, borderTop: "1px solid var(--color-border)", paddingTop: 6 }}>
                  {formatCurrency(dashboard.breakdown.incomeAfterOverdue)}
                </div>
                <div>Less: General Expenses</div>
                <div>− {formatCurrency(dashboard.breakdown.generalExpenses)}</div>
                <div>Less: Client-Level Expenses</div>
                <div>− {formatCurrency(dashboard.breakdown.clientExpenses)}</div>
                <div>Less: Case Expenses</div>
                <div>− {formatCurrency(dashboard.breakdown.caseExpenses)}</div>
                <div>Total Expenses</div>
                <div>− {formatCurrency(dashboard.breakdown.totalExpenses)}</div>
                <div style={{ fontWeight: 700, borderTop: "2px solid var(--color-border-strong)", paddingTop: 8 }}>
                  PROFIT
                </div>
                <div style={{ fontWeight: 700, borderTop: "2px solid var(--color-border-strong)", paddingTop: 8 }}>
                  {formatCurrency(dashboard.breakdown.profit)}
                </div>
              </div>
            </div>
          )}

          {drill === "overdue" && (
            <div className="card">
              <h3>Overdue Payments</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Client ID</th>
                      <th>Case</th>
                      <th>Matter #</th>
                      <th>Fee</th>
                      <th>Received</th>
                      <th>Outstanding</th>
                      <th>Days Overdue</th>
                      <th>Last Payment</th>
                      <th>Advocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueRows.map((r) => (
                      <tr key={r.feeId}>
                        <td>{r.clientName}</td>
                        <td>{r.clientId}</td>
                        <td>{r.caseNumber ?? "—"}</td>
                        <td>{r.matterNumber ?? "—"}</td>
                        <td>{formatCurrency(r.professionalFee)}</td>
                        <td>{formatCurrency(r.amountReceived)}</td>
                        <td>{formatCurrency(r.outstanding)}</td>
                        <td>{r.daysOverdue}</td>
                        <td>{r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString() : "—"}</td>
                        <td>{r.assignedAdvocate ?? "—"}</td>
                      </tr>
                    ))}
                    {overdueRows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="muted">
                          Nothing is currently overdue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {drill === "dueSoon" && (
            <div className="card">
              <h3>Due Soon</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Client ID</th>
                      <th>Case</th>
                      <th>Matter #</th>
                      <th>Fee</th>
                      <th>Received</th>
                      <th>Outstanding</th>
                      <th>Advocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueSoonRows.map((r) => (
                      <tr key={r.feeId}>
                        <td>{r.clientName}</td>
                        <td>{r.clientId}</td>
                        <td>{r.caseNumber ?? "—"}</td>
                        <td>{r.matterNumber ?? "—"}</td>
                        <td>{formatCurrency(r.professionalFee)}</td>
                        <td>{formatCurrency(r.amountReceived)}</td>
                        <td>{formatCurrency(r.outstanding)}</td>
                        <td>{r.assignedAdvocate ?? "—"}</td>
                      </tr>
                    ))}
                    {dueSoonRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="muted">
                          Nothing due soon.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {section === "search" && <AccountsSearch permissions={permissions} />}
      {section === "payments" && <PaymentList permissions={permissions} />}
      {section === "expenses" && permissions.viewExpenses && <ExpensesPanel permissions={permissions} />}
      {section === "invoices" && permissions.viewInvoice && <InvoicesPanel />}
      {section === "reports" && permissions.viewReports && <ReportsPanel />}
    </div>
  );
}
