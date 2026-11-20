import { AppLoader } from "../../components/AppLoader";

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useAccountsPermissions } from "../../hooks/useAccountsPermissions";
import { AccountsSearch } from "./AccountsSearch";
import { PaymentList } from "./Payments/PaymentList";
import { ExpensesPanel } from "./Expenses/ExpensesPanel";
import { InvoicesPanel } from "./Invoices/InvoicesPanel";
import { ReportsPanel } from "./Reports/ReportsPanel";

interface DashboardData {
  received: number;
  totalExpenses: number;
}

type Section =
  | "overview"
  | "search"
  | "payments"
  | "expenses"
  | "invoices"
  | "reports";

type Preset =
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH"
  | "FINANCIAL_YEAR"
  | "ALL_TIME"
  | "CUSTOM";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This Week" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "PREVIOUS_MONTH", label: "Previous Month" },
  { value: "FINANCIAL_YEAR", label: "This Financial Year" },
  { value: "ALL_TIME", label: "All Time" },
  { value: "CUSTOM", label: "Custom Range" },
];

/** Reusable inline loading indicator for this page */
function AccountsLoader(_props: { message?: string }) {
  return <AppLoader size="lg" />;
}

/** Simplified Accounts dashboard.
 * Total Amount means payments actually received.
 * Net result = received payments minus recorded expenses.
 */
export default function Accounts() {
  const { permissions, loading } = useAccountsPermissions();

  const [section, setSection] = useState<Section>("overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const [preset, setPreset] = useState<Preset>("THIS_MONTH");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const rangeReady =
    preset !== "CUSTOM" || Boolean(customStart && customEnd);

  useEffect(() => {
    if (!permissions.view || section !== "overview" || !rangeReady) {
      return;
    }

    let active = true;

    setLoadingDashboard(true);
    setDashboardError("");

    const params = {
      preset,
      startDate:
        preset === "CUSTOM" ? customStart : undefined,
      endDate:
        preset === "CUSTOM" ? customEnd : undefined,
    };

    api
      .get<DashboardData>("/accounts/dashboard", { params })
      .then((res) => {
        if (active) {
          setDashboard(res.data);
        }
      })
      .catch((error) => {
        console.error(
          "Failed to load Accounts dashboard:",
          error
        );

        if (active) {
          setDashboardError(
            "Unable to load Accounts summary. Please try again."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingDashboard(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    permissions.view,
    section,
    preset,
    customStart,
    customEnd,
    rangeReady,
    retryCount,
  ]);

  // Permission loading
  if (loading) {
    return <AccountsLoader message="Checking Accounts access..." />;
  }

  // Permission denied
  if (!permissions.view) {
    return (
      <div className="card">
        <p className="muted">
          You do not have access to Accounts. Contact your Managing
          Partner if you believe this is a mistake.
        </p>
      </div>
    );
  }

  const received = Number(dashboard?.received ?? 0);
  const expenses = Number(dashboard?.totalExpenses ?? 0);

  const net = received - expenses;
  const profit = Math.max(net, 0);
  const loss = Math.max(-net, 0);

  return (
    <div>
      <div className="page-header">
        <h1>ACCOUNTS</h1>
      </div>

      {/* Accounts Tabs */}
      <div
        className="tab-row"
        style={{
          maxWidth: 900,
        }}
      >
        <button
          className={section === "overview" ? "active" : ""}
          onClick={() => setSection("overview")}
        >
          Dashboard
        </button>

        <button
          className={section === "search" ? "active" : ""}
          onClick={() => setSection("search")}
        >
          Clients / Cases
        </button>

        <button
          className={section === "payments" ? "active" : ""}
          onClick={() => setSection("payments")}
        >
          Payments
        </button>

        {permissions.viewExpenses && (
          <button
            className={section === "expenses" ? "active" : ""}
            onClick={() => setSection("expenses")}
          >
            Expenses
          </button>
        )}

        {permissions.viewInvoice && (
          <button
            className={section === "invoices" ? "active" : ""}
            onClick={() => setSection("invoices")}
          >
            Invoices
          </button>
        )}

        {permissions.viewReports && (
          <button
            className={section === "reports" ? "active" : ""}
            onClick={() => setSection("reports")}
          >
            Reports
          </button>
        )}
      </div>

      {/* Dashboard */}
      {section === "overview" && (
        <div>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div>
              <label>Period</label>

              <select
                value={preset}
                onChange={(e) =>
                  setPreset(e.target.value as Preset)
                }
              >
                {PRESETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {preset === "CUSTOM" && (
              <>
                <div>
                  <label>From</label>

                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) =>
                      setCustomStart(e.target.value)
                    }
                  />
                </div>

                <div>
                  <label>To</label>

                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) =>
                      setCustomEnd(e.target.value)
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* Custom date validation */}
          {preset === "CUSTOM" && !rangeReady && (
            <p className="muted">
              Please select both From and To dates to view the
              Accounts summary.
            </p>
          )}

          {/* Dashboard Loading */}
          {loadingDashboard && rangeReady && (
            <div className="card">
              <AccountsLoader message="Loading Accounts summary..." />
            </div>
          )}

          {/* Dashboard Error */}
          {!loadingDashboard && dashboardError && (
            <div
              className="card"
              style={{
                textAlign: "center",
                padding: 24,
              }}
            >
              <p className="error-text">
                {dashboardError}
              </p>

              <button
                className="primary"
                onClick={() => setRetryCount((count) => count + 1)}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Dashboard Cards */}
          {!loadingDashboard &&
            !dashboardError &&
            dashboard && (
              <div className="dashboard-grid">
                <div className="stat-tile">
                  <div className="value">
                    {formatCurrency(received)}
                  </div>
                  <div className="label">Total Amount</div>
                </div>

                <div className="stat-tile">
                  <div className="value">
                    {formatCurrency(profit)}
                  </div>
                  <div className="label">Profit</div>
                </div>

                <div className="stat-tile">
                  <div className="value">
                    {formatCurrency(loss)}
                  </div>
                  <div className="label">Loss</div>
                </div>
              </div>
            )}

          {!loadingDashboard &&
            !dashboard &&
            !dashboardError &&
            rangeReady && (
              <p className="muted">
                No Accounts summary available.
              </p>
            )}

          <p
            className="muted"
            style={{
              marginTop: 12,
            }}
          >
            Profit/loss is calculated from payments received
            minus recorded expenses for the selected period.
          </p>
        </div>
      )}

      {/* Other Accounts Sections */}
      {section === "search" && (
        <AccountsSearch permissions={permissions} />
      )}

      {section === "payments" && (
        <PaymentList permissions={permissions} />
      )}

      {section === "expenses" &&
        permissions.viewExpenses && (
          <ExpensesPanel permissions={permissions} />
        )}

      {section === "invoices" &&
        permissions.viewInvoice && (
          <InvoicesPanel />
        )}

      {section === "reports" &&
        permissions.viewReports && (
          <ReportsPanel />
        )}
    </div>
  );
}
