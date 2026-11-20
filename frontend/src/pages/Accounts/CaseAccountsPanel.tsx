import { AppLoader } from "../../components/AppLoader";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { formatCurrency } from "../../utils/currency";
import { AccountsPermissions } from "../../hooks/useAccountsPermissions";
import { PaymentForm } from "./Payments/PaymentForm";
import { FeeForm } from "./Fees/FeeForm";

const EXPENSE_CATEGORIES = [
  "Court Fee", "Filing Fee", "Stamp Paper", "Process Fee", "Notary",
  "Documentation", "Courier", "Travel", "Accommodation", "Printing",
  "Typing", "Miscellaneous",
];

const PAYMENT_MODES = [
  "CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER",
];

interface CaseAccountsData {
  case: {
    id: string;
    matterNumber: string;
    courtCaseNumber: string | null;
  };
  clients: {
    id: string;
    clientId: string;
    name: string;
  }[];
  financialSummary: {
    agreedProfessionalFee: number;
    totalReceived: number;
    outstanding: number;
    overdue: number;
    dueDate: string | null;
    totalExpenses: number;
  };
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    mode: string;
    referenceNumber: string | null;
    remarks: string | null;
    recordedBy: { id: string; name: string };
    receiptDocument: { id: string; title: string } | null;
    fee: { id: string; description: string | null } | null;
  }[];
  expenses: {
    id: string;
    category: string;
    amount: number;
    date: string;
    vendor: string | null;
    paymentMode: string | null;
    description: string | null;
    incurredBy: { id: string; name: string };
    receiptDocument: { id: string; title: string } | null;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    total: number;
    issueDate: string;
    paymentStatus: string;
  }[];
}

/** Inline loading indicator */
function CaseAccountsLoader(_props: { message?: string }) {
  return <AppLoader size="lg" />;
}

export function CaseAccountsPanel({
  caseId,
  permissions,
}: {
  caseId: string;
  permissions: AccountsPermissions;
}) {
  const [data, setData] = useState<CaseAccountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [savingExpense, setSavingExpense] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await api.get<CaseAccountsData>(
        `/cases/${caseId}/accounts`
      );

      setData(res.data);
      setError("");
    } catch (err) {
      console.error("Failed to load case Accounts:", err);
      setLoadError(
        getErrorMessage(
          err,
          "Unable to load this case's Accounts data. Check your access permissions."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleExpenseSubmit(event: FormEvent) {
    event.preventDefault();

    if (!amount || Number(amount) <= 0) {
      setError("Enter an expense amount greater than zero.");
      return;
    }

    setSavingExpense(true);
    setError("");

    try {
      const form = new FormData();

      form.append("caseId", caseId);
      form.append("category", category);
      form.append("amount", amount);
      form.append(
        "date",
        new Date(`${date}T00:00:00`).toISOString()
      );
      form.append("paymentMode", paymentMode);

      if (vendor.trim()) form.append("vendor", vendor.trim());
      if (description.trim()) {
        form.append("description", description.trim());
      }
      if (receiptFile) form.append("file", receiptFile);

      await api.post("/accounts/expenses", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setShowExpenseForm(false);
      setAmount("");
      setVendor("");
      setDescription("");
      setReceiptFile(null);
      setDate(new Date().toISOString().slice(0, 10));

      await reload();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to add case expense.")
      );
    } finally {
      setSavingExpense(false);
    }
  }

  // Initial loading
  if (loading && !data) {
    return (
      <div className="card">
        <CaseAccountsLoader />
      </div>
    );
  }

  // Initial loading error
  if (loadError && !data) {
    return (
      <div
        className="card"
        style={{
          textAlign: "center",
          padding: 30,
        }}
      >
        <p className="error-text">{loadError}</p>

        <button className="primary" onClick={() => void reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { financialSummary: fs } = data;

  return (
    <div>
      <style>
        {`
          @keyframes caseAccountsSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <h3>Case Accounts — {data.case.matterNumber}</h3>

      {loading && (
        <div className="card">
          <CaseAccountsLoader message="Refreshing case Accounts..." />
        </div>
      )}

      <div
        className="dashboard-grid"
        style={{ marginBottom: 20 }}
      >
        <div className="stat-tile">
          <div className="value">
            {formatCurrency(fs.agreedProfessionalFee)}
          </div>
          <div className="label">Agreed Professional Fee</div>
        </div>

        <div className="stat-tile">
          <div className="value">
            {formatCurrency(fs.totalReceived)}
          </div>
          <div className="label">Total Received</div>
        </div>

        <div className="stat-tile">
          <div className="value">
            {formatCurrency(fs.totalExpenses)}
          </div>
          <div className="label">Total Case Expenses</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {permissions.manageFee && (
          <button
            className="secondary"
            onClick={() => setShowFeeForm(true)}
          >
            Add Professional Fee
          </button>
        )}

        {permissions.createPayment && (
          <button onClick={() => setShowPaymentForm(true)}>
            Record Payment
          </button>
        )}

        {permissions.createExpense && (
          <button
            onClick={() =>
              setShowExpenseForm((current) => !current)
            }
          >
            {showExpenseForm ? "Cancel Expense" : "Add Case Expense"}
          </button>
        )}
      </div>

      {showFeeForm && (
        <FeeForm
          defaultClientId={data.clients[0]?.id}
          defaultCaseId={data.case.id}
          onDone={() => {
            setShowFeeForm(false);
            void reload();
          }}
          onCancel={() => setShowFeeForm(false)}
        />
      )}

      {showPaymentForm && (
        <PaymentForm
          defaultClientId={data.clients[0]?.id}
          defaultCaseId={data.case.id}
          onDone={() => {
            setShowPaymentForm(false);
            void reload();
          }}
          onCancel={() => setShowPaymentForm(false)}
        />
      )}

      {showExpenseForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Add Expense to This Case</h3>

          <form
            onSubmit={handleExpenseSubmit}
            className="form-grid"
          >
            <div>
              <label>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <label>Expense Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label>Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                {PAYMENT_MODES.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Paid To / Vendor</label>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>

            <div>
              <label>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label>Receipt / Bill (optional)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff"
                onChange={(e) =>
                  setReceiptFile(e.target.files?.[0] ?? null)
                }
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={savingExpense}>
                {savingExpense ? "Saving..." : "Save Expense"}
              </button>

              <button
                type="button"
                className="secondary"
                disabled={savingExpense}
                onClick={() => setShowExpenseForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Payments</h3>

        {data.payments.length === 0 ? (
          <p className="muted">No payments recorded yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th>Recorded By</th>
                  <th>Receipt</th>
                </tr>
              </thead>

              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {new Date(
                        payment.paymentDate
                      ).toLocaleDateString()}
                    </td>
                    <td>{formatCurrency(payment.amount)}</td>
                    <td>{payment.mode.replaceAll("_", " ")}</td>
                    <td>{payment.referenceNumber ?? "—"}</td>
                    <td>{payment.recordedBy.name}</td>
                    <td>
                      {payment.receiptDocument ? "Attached" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Case Expenses</h3>

        {data.expenses.length === 0 ? (
          <p className="muted">
            No expenses added to this case yet.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Vendor</th>
                  <th>Description</th>
                  <th>Incurred By</th>
                  <th>Receipt</th>
                </tr>
              </thead>

              <tbody>
                {data.expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      {new Date(expense.date).toLocaleDateString()}
                    </td>
                    <td>{expense.category}</td>
                    <td>{formatCurrency(expense.amount)}</td>
                    <td>
                      {expense.paymentMode?.replaceAll("_", " ") ?? "—"}
                    </td>
                    <td>{expense.vendor ?? "—"}</td>
                    <td>{expense.description ?? "—"}</td>
                    <td>{expense.incurredBy.name}</td>
                    <td>
                      {expense.receiptDocument ? "Attached" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 12, fontWeight: 600 }}>
          Total Case Expenses:{" "}
          {formatCurrency(
            data.expenses.reduce(
              (sum, item) => sum + item.amount,
              0
            )
          )}
        </p>
      </div>

      <div className="card">
        <h3>Invoices</h3>

        {data.invoices.length === 0 ? (
          <p className="muted">
            No invoices for this case yet.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Issue Date</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/invoices/${invoice.id}`}>
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td>
                      {new Date(
                        invoice.issueDate
                      ).toLocaleDateString()}
                    </td>
                    <td>{formatCurrency(invoice.total)}</td>
                    <td>{invoice.paymentStatus}</td>
                    <td>
                      <Link to={`/invoices/${invoice.id}`}>
                        View / Print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
