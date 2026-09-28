import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { AccountsPermissions } from "../../hooks/useAccountsPermissions";
import { PaymentForm } from "./Payments/PaymentForm";
import { FeeForm } from "./Fees/FeeForm";

interface CaseAccountsData {
  case: { id: string; matterNumber: string; courtCaseNumber: string | null };
  clients: { id: string; clientId: string; name: string }[];
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
  invoices: { id: string; invoiceNumber: string; total: number; issueDate: string; paymentStatus: string }[];
}

/** ACCOUNTS module (2026-08-14, §21/§22) — shared between the Case Detail page's
 * "Accounts" tab and the Accounts module's own Case Search → Case Summary view.
 * Fetches GET /cases/:caseId/accounts (staff-Accounts-gated on the backend). */
export function CaseAccountsPanel({
  caseId,
  permissions,
}: {
  caseId: string;
  permissions: AccountsPermissions;
}) {
  const [data, setData] = useState<CaseAccountsData | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api
      .get<CaseAccountsData>(`/cases/${caseId}/accounts`)
      .then((res) => setData(res.data))
      .catch(() => setError("You do not have access to this case's Accounts data."));
  }, [caseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { financialSummary: fs } = data;

  return (
    <div>
      <div className="dashboard-grid" style={{ marginBottom: 20 }}>
        <div className="stat-tile">
          <div className="value">{formatCurrency(fs.agreedProfessionalFee)}</div>
          <div className="label">Agreed Professional Fee</div>
        </div>
        <div className="stat-tile">
          <div className="value">{formatCurrency(fs.totalReceived)}</div>
          <div className="label">Total Received</div>
        </div>
        <div className="stat-tile">
          <div className="value">{formatCurrency(fs.outstanding)}</div>
          <div className="label">Outstanding</div>
        </div>
        <div className="stat-tile">
          <div className="value">{formatCurrency(fs.overdue)}</div>
          <div className="label">Overdue</div>
        </div>
        <div className="stat-tile">
          <div className="value">{fs.dueDate ? new Date(fs.dueDate).toLocaleDateString() : "—"}</div>
          <div className="label">Due Date</div>
        </div>
        <div className="stat-tile">
          <div className="value">{formatCurrency(fs.totalExpenses)}</div>
          <div className="label">Total Expenses</div>
        </div>
      </div>

      {(permissions.manageFee || permissions.createPayment) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {permissions.manageFee && (
            <button className="secondary" onClick={() => setShowFeeForm(true)}>
              Add Professional Fee
            </button>
          )}
          {permissions.createPayment && (
            <button onClick={() => setShowPaymentForm(true)}>Record Payment</button>
          )}
        </div>
      )}
      {showFeeForm && (
        <FeeForm
          defaultClientId={data.clients[0]?.id}
          defaultCaseId={data.case.id}
          onDone={() => {
            setShowFeeForm(false);
            reload();
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
            reload();
          }}
          onCancel={() => setShowPaymentForm(false)}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Payments</h3>
        {data.payments.length === 0 && <p className="muted">No payments recorded yet.</p>}
        {data.payments.length > 0 && (
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
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{p.mode}</td>
                    <td>{p.referenceNumber ?? "—"}</td>
                    <td>{p.recordedBy.name}</td>
                    <td>{p.receiptDocument ? "Attached" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Expenses</h3>
        <p className="muted" style={{ marginTop: -8 }}>
          Only expenses belonging to this case — general firm expenses and other clients'/cases' expenses never appear here.
        </p>
        {data.expenses.length === 0 && <p className="muted">No expenses logged yet.</p>}
        {data.expenses.length > 0 && (
          <>
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
                  {data.expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.date).toLocaleDateString()}</td>
                      <td>{e.category}</td>
                      <td>{formatCurrency(e.amount)}</td>
                      <td>{e.paymentMode ? e.paymentMode.replaceAll("_", " ") : "—"}</td>
                      <td>{e.vendor ?? "—"}</td>
                      <td>{e.description ?? "—"}</td>
                      <td>{e.incurredBy.name}</td>
                      <td>{e.receiptDocument ? "Attached" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 12, fontWeight: 600 }}>
              Total Case Expenses: {formatCurrency(data.expenses.reduce((sum, e) => sum + e.amount, 0))}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Invoices</h3>
        {data.invoices.length === 0 && <p className="muted">No invoices for this case yet.</p>}
        {data.invoices.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Issue Date</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} className="clickable">
                    <td>
                      <Link to={`/invoices/${i.id}`}>{i.invoiceNumber}</Link>
                    </td>
                    <td>{new Date(i.issueDate).toLocaleDateString()}</td>
                    <td>{formatCurrency(i.total)}</td>
                    <td>
                      <span className={`badge payment-status-${i.paymentStatus}`}>{i.paymentStatus}</span>
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
