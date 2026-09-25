import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../api/client";
import { getErrorMessage } from "../../../api/errorMessage";

interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}
interface FeeOption {
  id: string;
  amount: number;
  outstanding: number;
}

const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];

/** ACCOUNTS module (2026-08-14, §14/§15/§16). Payment receipt permission fix
 * (2026-08-15) — the payment and its optional receipt are now created in a single
 * multipart request to POST /accounts/payments, gated solely by
 * ACCOUNTS.CREATE_PAYMENT (previously the receipt was attached via a second,
 * ACCOUNTS.EDIT_PAYMENT-gated call, which incorrectly required edit rights just to
 * attach a receipt at creation time). `defaultCaseId` absent + no case picked = a
 * client-level payment (§15); `feeId` left unselected = a case-level payment not
 * applied to any one fee (§16). A pure client-level payment can still attach a
 * receipt via the Document.clientId path. */
export function PaymentForm({
  defaultClientId,
  defaultCaseId,
  onDone,
  onCancel,
}: {
  defaultClientId?: string;
  defaultCaseId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClientLabel, setSelectedClientLabel] = useState("");
  const [caseId] = useState(defaultCaseId ?? "");
  const [feeId, setFeeId] = useState("");
  const [fees, setFees] = useState<FeeOption[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setFees([]);
      return;
    }
    api
      .get<FeeOption[]>("/accounts/fees", { params: { clientId, caseId: caseId || undefined } })
      .then((res) => setFees(res.data.filter((f) => f.outstanding > 0)));
  }, [clientId, caseId]);

  async function searchClients(q: string) {
    setClientQuery(q);
    if (q.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const res = await api.get<ClientOption[]>("/accounts/clients/search", { params: { q } });
    setClientResults(res.data);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Select a client");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("clientId", clientId);
      if (caseId) form.append("caseId", caseId);
      if (feeId) form.append("feeId", feeId);
      form.append("amount", amount);
      form.append("paymentDate", new Date(paymentDate).toISOString());
      form.append("mode", mode);
      if (referenceNumber) form.append("referenceNumber", referenceNumber);
      if (remarks) form.append("remarks", remarks);
      if (receiptFile) form.append("file", receiptFile);
      await api.post("/accounts/payments", form, { headers: { "Content-Type": "multipart/form-data" } });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to record payment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Record Payment</h3>
      <form onSubmit={handleSubmit} className="form-grid">
        {!defaultClientId && (
          <div style={{ position: "relative" }}>
            <label>Client</label>
            <input
              type="text"
              value={selectedClientLabel || clientQuery}
              onChange={(e) => {
                setSelectedClientLabel("");
                setClientId("");
                searchClients(e.target.value);
              }}
              placeholder="Search by name, Client ID, or mobile"
              required
            />
            {clientResults.length > 0 && !clientId && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 10,
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sm)",
                  marginTop: 2,
                  maxHeight: 220,
                  overflowY: "auto",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {clientResults.map((c) => (
                  <div
                    key={c.id}
                    className="searchable-select-option"
                    onClick={() => {
                      setClientId(c.id);
                      setSelectedClientLabel(`${c.name} (${c.clientId})`);
                      setClientResults([]);
                    }}
                  >
                    {c.name} ({c.clientId})
                  </div>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              Leave the case unspecified for a client-level payment.
            </p>
          </div>
        )}
        {fees.length > 0 && (
          <div>
            <label>Apply to Fee (optional)</label>
            <select value={feeId} onChange={(e) => setFeeId(e.target.value)}>
              <option value="">Not linked to a specific fee</option>
              {fees.map((f) => (
                <option key={f.id} value={f.id}>
                  Fee — outstanding {f.outstanding.toFixed(2)} of {f.amount.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}
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
            {PAYMENT_MODES.map((m) => (
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
          <label>Receipt / Proof (optional)</label>
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Payment"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
