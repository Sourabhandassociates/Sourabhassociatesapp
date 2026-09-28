import { SyntheticEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}
/** New Case form simplification (2026-08-11) — title is now optional. */
interface CaseOption {
  id: string;
  matterNumber: string;
  title: string | null;
}
interface CaseClientLink {
  client: { id: string; clientId: string; name: string };
}
interface TimeLogRow {
  id: string;
  date: string;
  hours: number;
  billable: boolean;
  invoiced: boolean;
  description: string | null;
  user: { id: string; name: string };
}
interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  billableToClient: boolean;
  invoiced: boolean;
}
interface ManualLineItem {
  description: string;
  quantity: string;
  rate: string;
}

const DISCOUNT_TYPES = [
  { value: "", label: "No discount" },
  { value: "PERCENTAGE", label: "Percentage (%)" },
  { value: "FLAT", label: "Flat amount" },
];

/**
 * Invoice-module completion pass (2026-08-06) — a dedicated full-page Create
 * Invoice screen (SRD Section 16.1), distinct from (and does not replace) the
 * Case Billing tab's own inline "Create Draft Invoice" section
 * (`CaseBilling.tsx`'s `CreateInvoiceSection`, left completely untouched). This
 * screen additionally supports a case-less "general" invoice, tax/discount,
 * notes/terms, and a live preview before saving — none of which the Case Billing
 * tab needed to grow, since that tab remains the fast path for "bill this case's
 * logged time/expenses" while this screen is the full-featured one.
 */
export default function NewInvoice() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseId, setCaseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [caseClients, setCaseClients] = useState<CaseClientLink[] | null>(null);
  const [timeLogs, setTimeLogs] = useState<TimeLogRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [selectedTimeLogs, setSelectedTimeLogs] = useState<Record<string, string>>({});
  const [selectedExpenses, setSelectedExpenses] = useState<Record<string, boolean>>({});
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([]);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discountType, setDiscountType] = useState<"" | "PERCENTAGE" | "FLAT">("");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/clients").then((res) => setClients(res.data));
    api.get("/cases").then((res) => setCases(res.data));
  }, []);

  useEffect(() => {
    if (!caseId) {
      setCaseClients(null);
      setTimeLogs([]);
      setExpenses([]);
      setSelectedTimeLogs({});
      setSelectedExpenses({});
      return;
    }
    api.get(`/cases/${caseId}`).then((res) => {
      const links: CaseClientLink[] = res.data.clients ?? [];
      setCaseClients(links);
      if (links.length > 0 && !links.some((l) => l.client.id === clientId)) {
        setClientId(links[0].client.id);
      }
    });
    api
      .get(`/cases/${caseId}/time-logs`)
      .then((res) => setTimeLogs((res.data as TimeLogRow[]).filter((t) => !t.invoiced && t.billable)))
      .catch(() => setTimeLogs([]));
    api
      .get(`/cases/${caseId}/expenses`)
      .then((res) => setExpenses((res.data as ExpenseRow[]).filter((e) => !e.invoiced && e.billableToClient)))
      .catch(() => setExpenses([]));
    setSelectedTimeLogs({});
    setSelectedExpenses({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  function addManualItem() {
    setManualItems((items) => [...items, { description: "", quantity: "1", rate: "" }]);
  }
  function updateManualItem(index: number, field: keyof ManualLineItem, value: string) {
    setManualItems((items) => items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }
  function removeManualItem(index: number) {
    setManualItems((items) => items.filter((_, i) => i !== index));
  }

  const filledManualItems = manualItems
    .filter((it) => it.description.trim() && Number(it.quantity) > 0 && Number(it.rate) > 0)
    .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity), rate: Number(it.rate) }));
  const timeLogItems = Object.entries(selectedTimeLogs)
    .filter(([, rate]) => rate)
    .map(([timeLogId, rate]) => ({ timeLogId, rate: Number(rate) }));
  const expenseItems = Object.entries(selectedExpenses)
    .filter(([, checked]) => checked)
    .map(([expenseId]) => ({ expenseId }));

  // Preview totals — mirrors invoices.service.ts's computeInvoiceTotals exactly
  // (discount on subtotal first, then tax on the post-discount amount) so what the
  // user sees here matches what the backend will actually store.
  const previewLineItems = [
    ...timeLogItems.map(({ timeLogId, rate }) => {
      const log = timeLogs.find((t) => t.id === timeLogId)!;
      return { description: log.description || "Time entry", amount: log.hours * rate };
    }),
    ...expenseItems.map(({ expenseId }) => {
      const expense = expenses.find((e) => e.id === expenseId)!;
      return { description: `${expense.category} expense`, amount: expense.amount };
    }),
    ...filledManualItems.map((it) => ({ description: it.description, amount: it.quantity * it.rate })),
  ];
  const subtotal = previewLineItems.reduce((sum, li) => sum + li.amount, 0);
  const discountValueNum = Number(discountValue) || 0;
  const discountAmount =
    discountType === "PERCENTAGE" ? subtotal * (discountValueNum / 100) : discountType === "FLAT" ? Math.min(discountValueNum, subtotal) : 0;
  const taxableAmount = subtotal - discountAmount;
  const taxRateNum = Number(taxRate) || 0;
  const taxAmount = taxableAmount * (taxRateNum / 100);
  const total = taxableAmount + taxAmount;

  function buildPayload() {
    return {
      caseId: caseId || undefined,
      clientId,
      issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      timeLogItems,
      expenseItems,
      manualItems: filledManualItems,
      taxRate: taxRateNum,
      discountType: discountType || undefined,
      discountValue: discountValueNum,
      notes: notes.trim() || undefined,
      termsAndConditions: termsAndConditions.trim() || undefined,
    };
  }

  async function handleSave(e: SyntheticEvent, action: "draft" | "approve" | "send") {
    e.preventDefault();
    setError(null);
    if (!clientId) return setError("Select a client");
    if (previewLineItems.length === 0) return setError("Add at least one line item to invoice");
    setSaving(true);
    try {
      const res = await api.post("/invoices", buildPayload());
      if (action === "approve" || action === "send") {
        await api.patch(`/invoices/${res.data.id}/approve`);
      }
      if (action === "send") {
        await api.patch(`/invoices/${res.data.id}/send`);
      }
      navigate(`/invoices/${res.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create invoice"));
    } finally {
      setSaving(false);
    }
  }

  const clientOptions = caseClients && caseClients.length > 0 ? caseClients.map((l) => l.client) : clients;

  return (
    <div>
      <div className="page-header">
        <h1>Create New Invoice</h1>
      </div>

      <form className="card" style={{ maxWidth: 800 }} onSubmit={(e) => handleSave(e, "draft")}>
        <div className="form-grid">
          <div>
            <label htmlFor="invCase">Matter / Case (optional)</label>
            <select id="invCase" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">General invoice (no matter)</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ? `${c.matterNumber} — ${c.title}` : c.matterNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="invClient">Client</label>
            <select id="invClient" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Select…</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientId} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="invIssueDate">Invoice Date</label>
            <input id="invIssueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="invDueDate">Due Date</label>
            <input id="invDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {caseId && timeLogs.length > 0 && (
          <>
            <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
              Unbilled time entries — enter a rate to include
            </p>
            {timeLogs.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ flex: 1 }}>
                  {new Date(t.date).toLocaleDateString()} — {t.user.name} — {t.hours}h {t.description ?? ""}
                </span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Rate/hr"
                  style={{ width: 100 }}
                  value={selectedTimeLogs[t.id] ?? ""}
                  onChange={(e) => setSelectedTimeLogs((s) => ({ ...s, [t.id]: e.target.value }))}
                />
              </div>
            ))}
          </>
        )}

        {caseId && expenses.length > 0 && (
          <>
            <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
              Unbilled billable expenses
            </p>
            {expenses.map((e) => (
              <label key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={!!selectedExpenses[e.id]}
                  onChange={(ev) => setSelectedExpenses((s) => ({ ...s, [e.id]: ev.target.checked }))}
                />
                {new Date(e.date).toLocaleDateString()} — {e.category} — {e.amount}
              </label>
            ))}
          </>
        )}

        <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
          Line items
        </p>
        {manualItems.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <input
              placeholder="Description"
              style={{ flex: 1 }}
              value={item.description}
              onChange={(e) => updateManualItem(i, "description", e.target.value)}
            />
            <input
              type="number"
              step="1"
              min="1"
              placeholder="Qty"
              style={{ width: 70 }}
              value={item.quantity}
              onChange={(e) => updateManualItem(i, "quantity", e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Rate"
              style={{ width: 100 }}
              value={item.rate}
              onChange={(e) => updateManualItem(i, "rate", e.target.value)}
            />
            <button type="button" onClick={() => removeManualItem(i)} aria-label="Remove line item">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addManualItem} style={{ marginTop: 4 }}>
          + Add Line Item
        </button>

        <h3 style={{ marginTop: 20 }}>Tax & Discount</h3>
        <div className="form-grid">
          <div>
            <label htmlFor="invTaxRate">GST / Tax Rate (%)</label>
            <input id="invTaxRate" type="number" step="0.01" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="invDiscountType">Discount</label>
            <select
              id="invDiscountType"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "" | "PERCENTAGE" | "FLAT")}
            >
              {DISCOUNT_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {discountType && (
          <>
            <label htmlFor="invDiscountValue">Discount {discountType === "PERCENTAGE" ? "(%)" : "Amount"}</label>
            <input
              id="invDiscountValue"
              type="number"
              step="0.01"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </>
        )}

        <label htmlFor="invNotes">Notes</label>
        <textarea id="invNotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label htmlFor="invTerms">Terms & Conditions</label>
        <textarea id="invTerms" rows={3} value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} />

        <h3 style={{ marginTop: 20 }}>Preview</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {previewLineItems.map((li, i) => (
                <tr key={i}>
                  <td>{li.description}</td>
                  <td>{li.amount.toFixed(2)}</td>
                </tr>
              ))}
              {previewLineItems.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    No line items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <p>Subtotal: {subtotal.toFixed(2)}</p>
          {discountAmount > 0 && <p>Discount: -{discountAmount.toFixed(2)}</p>}
          {taxAmount > 0 && <p>GST ({taxRateNum}%): {taxAmount.toFixed(2)}</p>}
          <p>
            <strong>Grand Total: {total.toFixed(2)}</strong>
          </p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="primary" type="submit" disabled={saving}>
            Save as Draft
          </button>
          <button type="button" disabled={saving} onClick={(e) => handleSave(e, "approve")}>
            Save & Approve
          </button>
          <button type="button" disabled={saving} onClick={(e) => handleSave(e, "send")}>
            Save, Approve & Send
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/invoices")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
