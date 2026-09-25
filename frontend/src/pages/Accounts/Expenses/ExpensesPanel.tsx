import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../../../api/client";
import { getErrorMessage } from "../../../api/errorMessage";
import { formatCurrency } from "../../../utils/currency";
import { AccountsPermissions } from "../../../hooks/useAccountsPermissions";

type ExpenseKind = "GENERAL" | "CLIENT" | "CASE";

interface ExpenseRow {
  id: string;
  kind: ExpenseKind;
  category: string;
  amount: number;
  date: string;
  vendor: string | null;
  paymentMode: string | null;
  description: string | null;
  case:
    | {
        id: string;
        matterNumber: string;
        courtCaseNumber: string | null;
        clients: { client: { id: string; clientId: string; name: string } }[];
      }
    | null;
  client: { id: string; clientId: string; name: string } | null;
  incurredBy: { id: string; name: string };
  receiptDocument: { id: string; title: string } | null;
}
interface CaseOption {
  id: string;
  matterNumber: string;
  courtCaseNumber: string | null;
}
interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}

const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];
const EXPENSE_CATEGORIES = [
  "Court Fee",
  "Filing Fee",
  "Stamp Paper",
  "Process Fee",
  "Notary",
  "Documentation",
  "Courier",
  "Travel",
  "Accommodation",
  "Printing",
  "Typing",
  "Miscellaneous",
];
const KIND_LABELS: Record<ExpenseKind, string> = { GENERAL: "General / Firm", CLIENT: "Client-Level", CASE: "Case-Level" };

/** ACCOUNTS module — Overview/Expenses completion pass (2026-08-15, §6-§19). Three
 * mutually exclusive expense kinds now share this one panel: General/Firm (no
 * client, no case — Office Rent, Salaries, ...), Client-Level (a client but no
 * case), and Case-Level (reuses the existing case-search create flow this panel
 * already had). The primary way to record a Case-Level expense is still
 * Cases → Case → Add Expense (CaseList.tsx) — this panel's own "Case-Level" option
 * exists for completeness/advanced use, not as the main workflow. */
export function ExpensesPanel({ permissions }: { permissions: AccountsPermissions }) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [filterKind, setFilterKind] = useState<"" | ExpenseKind>("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaymentMode, setFilterPaymentMode] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Create form
  const [kind, setKind] = useState<ExpenseKind>("GENERAL");
  const [caseQuery, setCaseQuery] = useState("");
  const [caseResults, setCaseResults] = useState<CaseOption[]>([]);
  const [caseId, setCaseId] = useState("");
  const [caseLabel, setCaseLabel] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    api
      .get<ExpenseRow[]>("/accounts/expenses", {
        params: {
          kind: filterKind || undefined,
          category: filterCategory || undefined,
          paymentMode: filterPaymentMode || undefined,
          vendor: filterVendor || undefined,
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined,
        },
      })
      .then((res) => setRows(res.data));
  }, [filterKind, filterCategory, filterPaymentMode, filterVendor, filterStartDate, filterEndDate]);
  useEffect(() => reload(), [reload]);

  async function searchCases(q: string) {
    setCaseQuery(q);
    setCaseId("");
    setCaseLabel("");
    if (q.trim().length < 2) {
      setCaseResults([]);
      return;
    }
    const res = await api.get<CaseOption[]>("/accounts/cases/search", { params: { q } });
    setCaseResults(res.data);
  }

  async function searchClients(q: string) {
    setClientQuery(q);
    setClientId("");
    setClientLabel("");
    if (q.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const res = await api.get<ClientOption[]>("/accounts/clients/search", { params: { q } });
    setClientResults(res.data);
  }

  function resetForm() {
    setKind("GENERAL");
    setCaseId("");
    setCaseQuery("");
    setCaseLabel("");
    setClientId("");
    setClientQuery("");
    setClientLabel("");
    setAmount("");
    setVendor("");
    setDescription("");
    setReceiptFile(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (kind === "CASE" && !caseId) {
      setError("Select a case");
      return;
    }
    if (kind === "CLIENT" && !clientId) {
      setError("Select a client");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      if (kind === "CASE") form.append("caseId", caseId);
      if (kind === "CLIENT") form.append("clientId", clientId);
      form.append("category", category);
      form.append("amount", amount);
      form.append("date", new Date(date).toISOString());
      if (vendor) form.append("vendor", vendor);
      if (description) form.append("description", description);
      form.append("paymentMode", paymentMode);
      if (receiptFile) form.append("file", receiptFile);
      await api.post("/accounts/expenses", form, { headers: { "Content-Type": "multipart/form-data" } });
      setShowForm(false);
      resetForm();
      reload();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to log expense"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    await api.delete(`/accounts/expenses/${id}`);
    reload();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label>Type</label>
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as "" | ExpenseKind)}>
            <option value="">All</option>
            <option value="GENERAL">General / Firm</option>
            <option value="CLIENT">Client-Level</option>
            <option value="CASE">Case-Level</option>
          </select>
        </div>
        <div>
          <label>Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Payment Mode</label>
          <select value={filterPaymentMode} onChange={(e) => setFilterPaymentMode(e.target.value)}>
            <option value="">All</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Vendor</label>
          <input type="text" value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} placeholder="Search vendor…" />
        </div>
        <div>
          <label>From</label>
          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
        </div>
        {permissions.createExpense && (
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add Expense"}</button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Add Expense</h3>
          <form onSubmit={handleSubmit} className="form-grid">
            <div>
              <label>Expense Type</label>
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as ExpenseKind);
                  setCaseId("");
                  setCaseQuery("");
                  setCaseLabel("");
                  setClientId("");
                  setClientQuery("");
                  setClientLabel("");
                }}
              >
                <option value="GENERAL">General / Firm Expense</option>
                <option value="CLIENT">Client-Level Expense</option>
                <option value="CASE">Case-Level Expense</option>
              </select>
            </div>
            {kind === "CASE" && (
              <div style={{ position: "relative" }}>
                <label>Case</label>
                <input
                  type="text"
                  value={caseLabel || caseQuery}
                  onChange={(e) => searchCases(e.target.value)}
                  placeholder="Search by case/matter number"
                  required
                />
                {caseResults.length > 0 && !caseId && (
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
                    {caseResults.map((c) => (
                      <div
                        key={c.id}
                        className="searchable-select-option"
                        onClick={() => {
                          setCaseId(c.id);
                          setCaseLabel(`${c.matterNumber}${c.courtCaseNumber ? ` (${c.courtCaseNumber})` : ""}`);
                          setCaseResults([]);
                        }}
                      >
                        {c.matterNumber} {c.courtCaseNumber ? `(${c.courtCaseNumber})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {kind === "CLIENT" && (
              <div style={{ position: "relative" }}>
                <label>Client</label>
                <input
                  type="text"
                  value={clientLabel || clientQuery}
                  onChange={(e) => searchClients(e.target.value)}
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
                          setClientLabel(`${c.name} (${c.clientId})`);
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
              <label>Expense Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Amount</label>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <label>Expense Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label>Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Paid To / Vendor</label>
              <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <label>Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label>Receipt / Bill Upload (optional)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Expense"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Client</th>
                <th>Case</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Vendor</th>
                <th>Mode</th>
                <th>Incurred By</th>
                <th>Receipt</th>
                {permissions.deleteExpense && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleDateString()}</td>
                  <td>{KIND_LABELS[e.kind]}</td>
                  <td>
                    {e.client
                      ? `${e.client.name} (${e.client.clientId})`
                      : e.case && e.case.clients.length > 0
                        ? e.case.clients.map((c) => c.client.name).join(", ")
                        : "—"}
                  </td>
                  <td>{e.case ? e.case.matterNumber : "—"}</td>
                  <td>{e.category}</td>
                  <td>{formatCurrency(e.amount)}</td>
                  <td>{e.vendor ?? "—"}</td>
                  <td>{e.paymentMode ? e.paymentMode.replaceAll("_", " ") : "—"}</td>
                  <td>{e.incurredBy.name}</td>
                  <td>{e.receiptDocument ? "Attached" : "—"}</td>
                  {permissions.deleteExpense && (
                    <td>
                      <button className="secondary" onClick={() => handleDelete(e.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="muted">
                    No expenses found.
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
