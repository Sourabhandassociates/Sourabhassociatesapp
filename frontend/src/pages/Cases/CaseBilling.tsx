import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";

interface TimeLogRow {
  id: string;
  date: string;
  hours: number;
  billable: boolean;
  description: string | null;
  invoiced: boolean;
  user: { id: string; name: string };
}
/** Simplified Case Expense Entry (2026-08-17) — `description` added; rows now come
 * from GET /cases/:caseId/billing-expenses/expenses (accountsService.listAccountsExpenses
 * filtered by caseId), the exact same Expense table the pre-existing Case → Billing →
 * Expenses flow always wrote to, so a case's older, category-based expenses and its
 * newer, quick-added ones appear side by side in one unified history. */
interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  billableToClient: boolean;
  invoiced: boolean;
  incurredBy: { id: string; name: string };
}
type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};
interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: PaymentStatus;
  total: number;
  issueDate: string;
  dueDate: string | null;
}
interface ClientLink {
  client: { id: string; clientId: string; name: string };
  partyRole: string;
}

/** Milestone 2 (Version 1.0 completion, SRD Section 16 — Billing & Invoicing). One of
 * the Case Detail tabs the SRD names directly (Section 6.2: "Overview | Documents |
 * Tasks | Hearings | Billing/Expenses | Timeline/Notes"). Each section independently
 * loads via its own permission-gated endpoint and hides itself on a 403 rather than
 * relying on the Case Detail's own (broader) access check — Office Staff and other
 * roles without billing access simply never see this tab at all (CaseDetail.tsx).
 */
export function Billing({ caseId, clients }: { caseId: string; clients: ClientLink[] }) {
  const [timeLogs, setTimeLogs] = useState<TimeLogRow[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);

  const loadTimeLogs = useCallback(() => {
    api
      .get(`/cases/${caseId}/time-logs`)
      .then((res) => setTimeLogs(res.data))
      .catch(() => setTimeLogs(null));
  }, [caseId]);
  /** Simplified Case Expense Entry (2026-08-17) — switched from the legacy
   * /cases/:caseId/expenses (expenses.service.ts, untouched, still used nowhere
   * else) to the new /cases/:caseId/billing-expenses/expenses, which returns
   * every Expense row for this case regardless of which flow created it. */
  const loadExpenses = useCallback(() => {
    api
      .get(`/cases/${caseId}/billing-expenses/expenses`)
      .then((res) => setExpenses(res.data))
      .catch(() => setExpenses(null));
  }, [caseId]);
  const loadInvoices = useCallback(() => {
    api
      .get("/invoices", { params: { caseId } })
      .then((res) => setInvoices(res.data))
      .catch(() => setInvoices(null));
  }, [caseId]);

  useEffect(() => {
    loadTimeLogs();
    loadExpenses();
    loadInvoices();
  }, [loadTimeLogs, loadExpenses, loadInvoices]);

  return (
    <div>
      {timeLogs && <TimeLogSection caseId={caseId} timeLogs={timeLogs} onChanged={loadTimeLogs} />}
      {expenses && <ExpenseSection caseId={caseId} expenses={expenses} onChanged={loadExpenses} />}
      {(timeLogs || expenses) && (
        <CreateInvoiceSection
          caseId={caseId}
          clients={clients}
          timeLogs={(timeLogs ?? []).filter((t) => !t.invoiced && t.billable)}
          expenses={(expenses ?? []).filter((e) => !e.invoiced && e.billableToClient)}
          onChanged={() => {
            loadTimeLogs();
            loadExpenses();
            loadInvoices();
          }}
        />
      )}
      {invoices && <InvoiceListSection invoices={invoices} />}
    </div>
  );
}

function TimeLogSection({
  caseId,
  timeLogs,
  onChanged,
}: {
  caseId: string;
  timeLogs: TimeLogRow[];
  onChanged: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [billable, setBillable] = useState(true);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/cases/${caseId}/time-logs`, {
        date: new Date(date).toISOString(),
        hours: Number(hours),
        billable,
        description: description || undefined,
      });
      setHours("");
      setDescription("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to log time"));
    }
  }

  return (
    <div className="card">
      <h3>Time Logs</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Hours</th>
              <th>Billable</th>
              <th>Description</th>
              <th>Invoiced</th>
            </tr>
          </thead>
          <tbody>
            {timeLogs.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>{t.user.name}</td>
                <td>{t.hours}</td>
                <td>{t.billable ? "Yes" : "No"}</td>
                <td>{t.description ?? "—"}</td>
                <td>{t.invoiced ? "Yes" : "No"}</td>
              </tr>
            ))}
            {timeLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No time logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAdd} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <div>
            <label htmlFor="tlDate">Date</label>
            <input id="tlDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="tlHours">Hours</label>
            <input
              id="tlHours"
              type="number"
              step="0.1"
              min="0.1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
        </div>
        <label htmlFor="tlDescription">Description</label>
        <input id="tlDescription" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          Billable
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary" type="submit" style={{ marginTop: 8 }}>
          Log Time
        </button>
      </form>
    </div>
  );
}

/**
 * Simplified Case Expense Entry (2026-08-17) — §14/§15/§18. The Add Expense form
 * now asks for exactly four things: Date, Description, Amount, and a read-only
 * Entered By (the logged-in user's own name — display only; the backend derives
 * the real value from the authenticated actor and ignores anything the client
 * might send, so there is nothing to spoof here even if this display were
 * tampered with). No Category/Payment Mode/Vendor/Client/Case/receipt field.
 * Posts to POST /cases/:caseId/billing-expenses/expenses, gated by
 * CASE_BILLING_EXPENSES.VIEW + EXPENSES.CREATE — Billing/Expenses and Accounts
 * are deliberately independent security domains (2026-08-17 authorization
 * correction), so recording a case expense never requires any ACCOUNTS.*
 * permission. A category is still stored (the database column remains
 * required), defaulted server-side to "Case Expense" since this form has no
 * category field. Delete goes through the pre-existing, unmodified
 * DELETE /expenses/:id (EXPENSES.DELETE — expenses.routes.ts) — reused as-is,
 * not the Accounts module's delete endpoint. The "Billable to Client"/Category
 * columns from the pre-existing, more detailed flow still display for any older
 * row that has them (still visible, still usable for invoicing further down
 * this tab), they're just no longer asked of the user creating a NEW case
 * expense from this quick form.
 */
function ExpenseSection({
  caseId,
  expenses,
  onChanged,
}: {
  caseId: string;
  expenses: ExpenseRow[];
  onChanged: () => void;
}) {
  const { auth } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/cases/${caseId}/billing-expenses/expenses`, {
        date: new Date(date).toISOString(),
        description,
        amount: Number(amount),
      });
      setDescription("");
      setAmount("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to log expense"));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    await api.delete(`/expenses/${id}`);
    onChanged();
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="card">
      <h3>Expenses</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Entered By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.date).toLocaleDateString()}</td>
                <td>{e.description || e.category}</td>
                <td>{e.amount}</td>
                <td>{e.incurredBy.name}</td>
                <td>
                  {!e.invoiced && <button onClick={() => handleDelete(e.id)}>Delete</button>}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>
                  Total Case Expenses
                </td>
                <td style={{ fontWeight: 600 }}>{total}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <form onSubmit={handleAdd} style={{ marginTop: 12 }}>
        <h4 style={{ margin: "0 0 8px" }}>Add Expense</h4>
        <div className="form-grid">
          <div>
            <label htmlFor="expDate">Date</label>
            <input id="expDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="expAmount">Amount</label>
            <input
              id="expAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>
        <label htmlFor="expDescription">Description</label>
        <input
          id="expDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Court filing expense"
          required
        />
        <label htmlFor="expEnteredBy">Entered By</label>
        <input id="expEnteredBy" value={auth?.name ?? ""} readOnly disabled />
        {error && <p className="error-text">{error}</p>}
        <button className="primary" type="submit" style={{ marginTop: 8 }}>
          Save Expense
        </button>
      </form>
    </div>
  );
}

interface ManualLineItem {
  description: string;
  quantity: string;
  rate: string;
}

/** Billing bug fix (2026-08-06) — previously this whole card returned null and
 * vanished entirely whenever a case had no unbilled time logs/expenses, leaving no
 * way to create an invoice at all (the reported "not able to create a new invoice"
 * issue). The backend has always accepted free-form `manualItems` for exactly this
 * case (a fixed-fee/retainer line, or billing before any time/expense is logged);
 * the UI simply never exposed it. Now the card always renders (as long as the case
 * has a linked client to bill), with manual line items alongside the existing
 * unbilled-time/unbilled-expense pickers. */
function CreateInvoiceSection({
  caseId,
  clients,
  timeLogs,
  expenses,
  onChanged,
}: {
  caseId: string;
  clients: ClientLink[];
  timeLogs: TimeLogRow[];
  expenses: ExpenseRow[];
  onChanged: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.client.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [selectedTimeLogs, setSelectedTimeLogs] = useState<Record<string, string>>({});
  const [selectedExpenses, setSelectedExpenses] = useState<Record<string, boolean>>({});
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addManualItem() {
    setManualItems((items) => [...items, { description: "", quantity: "1", rate: "" }]);
  }
  function updateManualItem(index: number, field: keyof ManualLineItem, value: string) {
    setManualItems((items) => items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }
  function removeManualItem(index: number) {
    setManualItems((items) => items.filter((_, i) => i !== index));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const timeLogItems = Object.entries(selectedTimeLogs)
      .filter(([, rate]) => rate)
      .map(([timeLogId, rate]) => ({ timeLogId, rate: Number(rate) }));
    const expenseItems = Object.entries(selectedExpenses)
      .filter(([, checked]) => checked)
      .map(([expenseId]) => ({ expenseId }));
    const filledManualItems = manualItems
      .filter((it) => it.description.trim() && Number(it.quantity) > 0 && Number(it.rate) > 0)
      .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity), rate: Number(it.rate) }));

    if (timeLogItems.length + expenseItems.length + filledManualItems.length === 0) {
      setError("Select at least one time entry/expense, or add a manual line item, to invoice");
      return;
    }
    try {
      const res = await api.post("/invoices", {
        caseId,
        clientId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        timeLogItems,
        expenseItems,
        manualItems: filledManualItems,
      });
      setSuccess(`Draft invoice ${res.data.invoiceNumber} created.`);
      setSelectedTimeLogs({});
      setSelectedExpenses({});
      setManualItems([]);
      setDueDate("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create invoice"));
    }
  }

  if (clients.length === 0) {
    return (
      <div className="card">
        <h3>Create Draft Invoice</h3>
        <p className="muted">Link a client to this case before creating an invoice.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Create Draft Invoice</h3>
      <form onSubmit={handleCreate}>
        <div className="form-grid">
          <div>
            <label htmlFor="invoiceClient">Bill to</label>
            <select id="invoiceClient" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              {clients.map((c) => (
                <option key={c.client.id} value={c.client.id}>
                  {c.client.clientId} — {c.client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="invoiceDueDate">Due Date (optional)</label>
            <input id="invoiceDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {timeLogs.length > 0 && (
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

        {expenses.length > 0 && (
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
          Manual line items (e.g. a fixed fee or retainer, unrelated to logged time/expenses)
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
          + Add Manual Line Item
        </button>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <div>
          <button className="primary" type="submit" style={{ marginTop: 12 }} disabled={!clientId}>
            Create Draft Invoice
          </button>
        </div>
      </form>
    </div>
  );
}

function InvoiceListSection({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <div className="card">
      <h3>Invoices</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Status</th>
              <th>Payment Status</th>
              <th>Total</th>
              <th>Issue Date</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="clickable">
                <td>
                  <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
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
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
