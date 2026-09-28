import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";
import { useAccountsPermissions } from "../../hooks/useAccountsPermissions";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}
interface Payment {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
}
type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

interface InvoiceDetailData {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: PaymentStatus;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: "PERCENTAGE" | "FLAT" | null;
  discountValue: number;
  discountAmount: number;
  notes: string | null;
  termsAndConditions: string | null;
  total: number;
  /** Nullable as of the invoice-module completion pass — a "general" invoice
   * created from /invoices/new isn't tied to any matter. `title` is separately
   * optional as of the New Case form simplification (2026-08-11). */
  case: { id: string; matterNumber: string; title: string | null } | null;
  client: { clientId: string; name: string };
  lineItems: LineItem[];
  payments: Payment[];
  createdBy: { name: string };
  approvedBy: { name: string } | null;
}

/** SRD Section 16.1 — Invoice Approval Screen (Partner) + Invoice List & Payment
 * Status Screen (Section 6.8), combined into one detail view. */
export default function InvoiceDetail() {
  const { id } = useParams();
  const { auth } = useAuth();
  const { permissions: accountsPermissions } = useAccountsPermissions();
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editTerms, setEditTerms] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const load = useCallback(() => {
    api.get(`/invoices/${id}`).then((res) => setInvoice(res.data));
  }, [id]);
  useEffect(() => load(), [load]);

  if (!invoice) return <p>Loading…</p>;

  const canApprove = auth?.role === "MANAGING_PARTNER";
  const canRecordPayment = auth?.role === "MANAGING_PARTNER" || auth?.role === "ACCOUNTS_TEAM";
  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.total - paid;

  async function handleApprove() {
    setError(null);
    try {
      await api.patch(`/invoices/${id}/approve`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to approve invoice"));
    }
  }

  async function handleSend() {
    setError(null);
    try {
      await api.patch(`/invoices/${id}/send`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to send invoice"));
    }
  }

  function startEdit() {
    if (!invoice) return;
    setEditNotes(invoice.notes ?? "");
    setEditTerms(invoice.termsAndConditions ?? "");
    setEditDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
    setEditing(true);
  }

  /** ACCOUNTS module (2026-08-14, §23) — DRAFT-only, notes/terms/due date only. */
  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/invoices/${id}`, {
        notes: editNotes || undefined,
        termsAndConditions: editTerms || undefined,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save changes"));
    }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/invoices/${id}/payments`, { amount: Number(paymentAmount), method: paymentMethod || undefined });
      setPaymentAmount("");
      setPaymentMethod("");
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to record payment"));
    }
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      await downloadFile(`/invoices/${id}/pdf`, {}, `${invoice!.invoiceNumber}.pdf`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to download invoice PDF"));
    }
  }

  async function handlePrint() {
    setError(null);
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to print invoice"));
    }
  }

  async function handleShare() {
    setError(null);
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const filename = `${invoice!.invoiceNumber}.pdf`;
      const file = new File([res.data], filename, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
      const blobUrl = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(getErrorMessage(err, "Failed to share invoice"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{invoice.invoiceNumber}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge">{invoice.status}</span>
          <span className={`badge payment-status-${invoice.paymentStatus}`}>
            {PAYMENT_STATUS_LABEL[invoice.paymentStatus]}
          </span>
          <button onClick={handleDownloadPdf}>Download PDF</button>
          <button onClick={handlePrint}>Print Invoice</button>
          <button onClick={handleShare}>Share Invoice</button>
        </div>
      </div>

      <div className="card">
        <h3>Details</h3>
        <p>
          <strong>Matter:</strong>{" "}
          {invoice.case ? (
            <>
              <Link to={`/cases/${invoice.case.id}`}>{invoice.case.matterNumber}</Link>
              {invoice.case.title ? ` — ${invoice.case.title}` : ""}
            </>
          ) : (
            <span className="muted">General invoice (not tied to a matter)</span>
          )}
        </p>
        <p>
          <strong>Client:</strong> {invoice.client.clientId} — {invoice.client.name}
        </p>
        <p>
          <strong>Issue Date:</strong> {new Date(invoice.issueDate).toLocaleDateString()}
        </p>
        <p>
          <strong>Due Date:</strong> {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}
        </p>
        <p>
          <strong>Created By:</strong> {invoice.createdBy.name}
        </p>
        {invoice.approvedBy && (
          <p>
            <strong>Approved By:</strong> {invoice.approvedBy.name}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        {canApprove && invoice.status === "DRAFT" && (
          <button className="primary" onClick={handleApprove}>
            Approve Invoice
          </button>
        )}
        {canApprove && invoice.status === "APPROVED" && (
          <button className="primary" onClick={handleSend}>
            Send to Client
          </button>
        )}
        {accountsPermissions.editInvoice && invoice.status === "DRAFT" && !editing && (
          <button className="secondary" onClick={startEdit} style={{ marginLeft: 8 }}>
            Edit Invoice
          </button>
        )}
        {editing && (
          <form onSubmit={handleSaveEdit} className="form-grid" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="editDueDate">Due Date</label>
              <input id="editDueDate" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="editNotes">Notes</label>
              <textarea id="editNotes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div>
              <label htmlFor="editTerms">Terms &amp; Conditions</label>
              <textarea id="editTerms" value={editTerms} onChange={(e) => setEditTerms(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" type="submit">
                Save Changes
              </button>
              <button type="button" className="secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Line Items</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.description}</td>
                  <td>{li.quantity}</td>
                  <td>{li.rate}</td>
                  <td>{li.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <p>Subtotal: {invoice.subtotal.toFixed(2)}</p>
          {invoice.discountAmount > 0 && (
            <p>
              Discount {invoice.discountType === "PERCENTAGE" ? `(${invoice.discountValue}%)` : ""}: -
              {invoice.discountAmount.toFixed(2)}
            </p>
          )}
          {invoice.taxAmount > 0 && <p>GST ({invoice.taxRate}%): {invoice.taxAmount.toFixed(2)}</p>}
          <p>
            <strong>Grand Total: {invoice.total.toFixed(2)}</strong>
          </p>
          <p>Amount Paid: {paid.toFixed(2)}</p>
          <p>
            <strong>Balance Due: {remaining.toFixed(2)}</strong>
          </p>
        </div>
      </div>

      {(invoice.notes || invoice.termsAndConditions) && (
        <div className="card">
          {invoice.notes && (
            <>
              <h3>Notes</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</p>
            </>
          )}
          {invoice.termsAndConditions && (
            <>
              <h3>Terms &amp; Conditions</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{invoice.termsAndConditions}</p>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3>Payments</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td>{p.amount}</td>
                  <td>{p.method ?? "—"}</td>
                </tr>
              ))}
              {invoice.payments.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 8 }}>
          <strong>Remaining balance: {remaining.toFixed(2)}</strong>
        </p>
        {canRecordPayment && ["APPROVED", "SENT", "PARTIALLY_PAID"].includes(invoice.status) && (
          <form onSubmit={handleRecordPayment} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 12 }}>
            <div>
              <label htmlFor="paymentAmount">Amount</label>
              <input
                id="paymentAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="paymentMethod">Method</label>
              <input id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </div>
            <button className="primary" type="submit">
              Record Payment
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
