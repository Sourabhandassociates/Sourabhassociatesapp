import { FormEvent, useState } from "react";
import { api } from "../../../api/client";
import { getErrorMessage } from "../../../api/errorMessage";

interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}

/** ACCOUNTS module (2026-08-14, §12) — create a Professional Fee. When invoked from a
 * case context (Case Accounts tab), `defaultClientId`/`defaultCaseId` are pre-filled
 * and locked; when invoked standalone (Accounts → Clients/Cases search), the user
 * picks a client via the inline search below. */
export function FeeForm({
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
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      await api.post("/accounts/fees", {
        clientId,
        caseId: defaultCaseId || undefined,
        amount: Number(amount),
        description: description || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        agreementDate: agreementDate ? new Date(agreementDate).toISOString() : undefined,
        remarks: remarks || undefined,
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create fee"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Add Professional Fee</h3>
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
          </div>
        )}
        <div>
          <label>Fee Amount</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label>Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label>Fee Agreement Date</label>
          <input type="date" value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
        </div>
        <div>
          <label>Remarks</label>
          <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Fee"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
