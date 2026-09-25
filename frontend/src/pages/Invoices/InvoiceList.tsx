import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";

type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: PaymentStatus;
  total: number;
  issueDate: string;
  dueDate: string | null;
  /** Nullable as of the invoice-module completion pass — a "general" invoice
   * created from /invoices/new isn't tied to any matter. */
  case: { matterNumber: string; title: string } | null;
  client: { clientId: string; name: string };
}

const STATUSES = ["", "DRAFT", "APPROVED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

/** Billing bug-fix pass (2026-08-06) — payment-status filter tabs, distinct from the
 * "Status" dropdown above (the lifecycle status). Both combine via a plain AND, same
 * as the search box below. */
const PAYMENT_STATUS_TABS: { key: PaymentStatus | ""; label: string }[] = [
  { key: "", label: "All Invoices" },
  { key: "PENDING", label: "Pending Invoices" },
  { key: "PARTIALLY_PAID", label: "Partially Paid Invoices" },
  { key: "PAID", label: "Fully Paid Invoices" },
  { key: "OVERDUE", label: "Overdue Invoices" },
];

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

/** SRD Section 16.1 — Invoice List & Payment Status Screen (Section 6.8). Managing
 * Partner/Accounts Team only (BILLING.VIEW). */
export default function InvoiceList() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const canCreate = auth?.role === "MANAGING_PARTNER" || auth?.role === "ACCOUNTS_TEAM" || auth?.role === "ASSOCIATE";
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [search, setSearch] = useState("");

  function load(s = status, ps = paymentStatus) {
    api
      .get("/invoices", { params: { ...(s ? { status: s } : {}), ...(ps ? { paymentStatus: ps } : {}) } })
      .then((res) => setInvoices(res.data));
  }
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchLower = search.trim().toLowerCase();
  const visibleInvoices = searchLower
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(searchLower) ||
          (inv.case?.matterNumber.toLowerCase().includes(searchLower) ?? false) ||
          inv.client.clientId.toLowerCase().includes(searchLower) ||
          inv.client.name.toLowerCase().includes(searchLower)
      )
    : invoices;

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
        {canCreate && (
          <button className="primary" onClick={() => navigate("/invoices/new")}>
            + Create New Invoice
          </button>
        )}
      </div>

      <div className="tab-row" style={{ flexWrap: "wrap" }}>
        {PAYMENT_STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            className={paymentStatus === tab.key ? "active" : ""}
            onClick={() => {
              setPaymentStatus(tab.key);
              load(status, tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0" }}>
        <div>
          <label htmlFor="invoiceSearch">Search</label>
          <input
            id="invoiceSearch"
            placeholder="Search by invoice no., matter no., or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div>
          <label htmlFor="statusFilter">Status</label>
          <select
            id="statusFilter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              load(e.target.value, paymentStatus);
            }}
            style={{ maxWidth: 220 }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Matter</th>
              <th>Client</th>
              <th>Status</th>
              <th>Payment Status</th>
              <th>Total</th>
              <th>Issue Date</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {visibleInvoices.map((inv) => (
              <tr key={inv.id} className="clickable">
                <td>
                  <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td>{inv.case?.matterNumber ?? <span className="muted">General</span>}</td>
                <td>
                  {inv.client.clientId} — {inv.client.name}
                </td>
                <td>
                  <span className="badge">{inv.status}</span>
                </td>
                <td>
                  <span className={`badge payment-status-${inv.paymentStatus}`}>
                    {PAYMENT_STATUS_LABEL[inv.paymentStatus]}
                  </span>
                </td>
                <td>{inv.total}</td>
                <td>{new Date(inv.issueDate).toLocaleDateString()}</td>
                <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {visibleInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No invoices match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
