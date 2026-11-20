import { AppLoader } from "../../components/AppLoader";

import { useEffect, useRef, useState } from "react";
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
  case: { matterNumber: string; title: string } | null;
  client: { clientId: string; name: string };
}

const STATUSES = [
  "",
  "DRAFT",
  "APPROVED",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
];

const PAYMENT_STATUS_TABS: {
  key: PaymentStatus | "";
  label: string;
}[] = [
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

export default function InvoiceList() {
  const navigate = useNavigate();
  const { auth } = useAuth();

  const canCreate =
    auth?.role === "MANAGING_PARTNER" ||
    auth?.role === "ACCOUNTS_TEAM" ||
    auth?.role === "ASSOCIATE";

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestId = useRef(0);

  async function load(
    s = status,
    ps = paymentStatus
  ) {
    const currentRequest = ++requestId.current;

    setLoading(true);
    setError("");

    try {
      const res = await api.get("/invoices", {
        params: {
          ...(s ? { status: s } : {}),
          ...(ps ? { paymentStatus: ps } : {}),
        },
      });

      if (currentRequest !== requestId.current) return;

      setInvoices(res.data);
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      console.error("Failed to load invoices:", err);
      setError("Unable to load invoices. Please try again.");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();

    return () => {
      requestId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchLower = search.trim().toLowerCase();

  const visibleInvoices = searchLower
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(searchLower) ||
          (inv.case?.matterNumber.toLowerCase().includes(searchLower) ??
            false) ||
          inv.client.clientId.toLowerCase().includes(searchLower) ||
          inv.client.name.toLowerCase().includes(searchLower)
      )
    : invoices;

  return (
    <div>
      <style>
        {`
          @keyframes invoiceListSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      <div className="page-header">
        <h1>Invoices</h1>

        {canCreate && (
          <button
            className="primary"
            onClick={() => navigate("/invoices/new")}
          >
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

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          margin: "12px 0",
        }}
      >
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
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <div
                    style={{
                      minHeight: 220,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      padding: 30,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        border: "4px solid #e5e7eb",
                        borderTop: "4px solid #2563eb",
                        borderRadius: "50%",
                        animation: "invoiceListSpin 0.8s linear infinite",
                      }}
                    />

                    <AppLoader size="sm" />

                    
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8}>
                  <div
                    style={{
                      minHeight: 180,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      padding: 24,
                    }}
                  >
                    <p style={{ color: "#dc2626", margin: 0 }}>
                      {error}
                    </p>

                    <button
                      className="primary"
                      onClick={() => load()}
                    >
                      Try Again
                    </button>
                  </div>
                </td>
              </tr>
            ) : visibleInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              visibleInvoices.map((inv) => (
                <tr key={inv.id} className="clickable">
                  <td>
                    <Link to={`/invoices/${inv.id}`}>
                      {inv.invoiceNumber}
                    </Link>
                  </td>

                  <td>
                    {inv.case?.matterNumber ?? (
                      <span className="muted">General</span>
                    )}
                  </td>

                  <td>
                    {inv.client.clientId} — {inv.client.name}
                  </td>

                  <td>
                    <span className="badge">{inv.status}</span>
                  </td>

                  <td>
                    <span
                      className={`badge payment-status-${inv.paymentStatus}`}
                    >
                      {PAYMENT_STATUS_LABEL[inv.paymentStatus]}
                    </span>
                  </td>

                  <td>{inv.total}</td>

                  <td>
                    {new Date(inv.issueDate).toLocaleDateString()}
                  </td>

                  <td>
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
