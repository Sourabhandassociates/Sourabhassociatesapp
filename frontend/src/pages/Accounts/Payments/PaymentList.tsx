import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../../../api/client";
import { getErrorMessage } from "../../../api/errorMessage";
import { formatCurrency } from "../../../utils/currency";
import { AccountsPermissions } from "../../../hooks/useAccountsPermissions";
import { PaymentForm } from "./PaymentForm";

interface PaymentRow {
  id: string;
  amount: number;
  paymentDate: string;
  mode: string;
  referenceNumber: string | null;
  remarks: string | null;
  receiptDocumentId: string | null;
  client: { id: string; clientId: string; name: string };
  case: { id: string; matterNumber: string } | null;
  recordedBy: { id: string; name: string };
}

const PAYMENT_MODES = ["", "CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];
const PAYMENT_MODE_OPTIONS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];

/** ACCOUNTS module (2026-08-14, §14/§17) — chronological payment history, filterable
 * by date/mode, create/edit/delete per the actor's granular permissions.
 * Payment receipt permission fix (2026-08-15) — editing a payment's fields and
 * replacing/attaching a receipt on an EXISTING payment both require
 * ACCOUNTS.EDIT_PAYMENT (POST /payments/:id/receipt); a user who only holds
 * ACCOUNTS.CREATE_PAYMENT can attach a receipt at creation time (via PaymentForm)
 * but has no Edit control here at all. */
export function PaymentList({ permissions }: { permissions: AccountsPermissions }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .get<PaymentRow[]>("/accounts/payments", {
        params: { mode: mode || undefined, startDate: startDate || undefined, endDate: endDate || undefined },
      })
      .then((res) => setRows(res.data));
  }, [mode, startDate, endDate]);

  useEffect(() => reload(), [reload]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this payment? This cannot be undone.")) return;
    await api.delete(`/accounts/payments/${id}`);
    reload();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m ? m.replaceAll("_", " ") : "All modes"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {permissions.createPayment && <button onClick={() => setShowForm(true)}>Record Payment</button>}
      </div>

      {showForm && (
        <PaymentForm
          onDone={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingId && (
        <PaymentEditForm
          payment={rows.find((r) => r.id === editingId)!}
          onDone={() => {
            setEditingId(null);
            reload();
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Case</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Receipt</th>
                <th>Recorded By</th>
                {(permissions.editPayment || permissions.deletePayment) && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                  <td>
                    {p.client.name} ({p.client.clientId})
                  </td>
                  <td>{p.case?.matterNumber ?? "Client-level"}</td>
                  <td>{formatCurrency(p.amount)}</td>
                  <td>{p.mode.replaceAll("_", " ")}</td>
                  <td>{p.referenceNumber ?? "—"}</td>
                  <td>{p.receiptDocumentId ? "Attached" : "—"}</td>
                  <td>{p.recordedBy.name}</td>
                  {(permissions.editPayment || permissions.deletePayment) && (
                    <td style={{ display: "flex", gap: 8 }}>
                      {permissions.editPayment && (
                        <button className="secondary" onClick={() => setEditingId(p.id)}>
                          Edit
                        </button>
                      )}
                      {permissions.deletePayment && (
                        <button className="secondary" onClick={() => handleDelete(p.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Payment receipt permission fix (2026-08-15) — the only UI path to
 * PATCH /accounts/payments/:id and to replacing a receipt on an existing payment
 * (POST /accounts/payments/:id/receipt), both ACCOUNTS.EDIT_PAYMENT-gated on the
 * backend. Only ever rendered when the actor holds editPayment (see PaymentList
 * above), but the backend re-checks independently regardless. */
function PaymentEditForm({ payment, onDone, onCancel }: { payment: PaymentRow; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate.slice(0, 10));
  const [mode, setMode] = useState(payment.mode);
  const [referenceNumber, setReferenceNumber] = useState(payment.referenceNumber ?? "");
  const [remarks, setRemarks] = useState(payment.remarks ?? "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch(`/accounts/payments/${payment.id}`, {
        amount: Number(amount),
        paymentDate: new Date(paymentDate).toISOString(),
        mode,
        referenceNumber: referenceNumber || undefined,
        remarks: remarks || undefined,
      });
      if (receiptFile) {
        const form = new FormData();
        form.append("file", receiptFile);
        await api.post(`/accounts/payments/${payment.id}/receipt`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Edit Payment</h3>
      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label>Amount</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label>Payment Date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
        </div>
        <div>
          <label>Payment Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} required>
            {PAYMENT_MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Transaction / Reference Number</label>
          <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label>Remarks</label>
          <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div>
          <label>{payment.receiptDocumentId ? "Replace Receipt / Proof" : "Attach Receipt / Proof"}</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
