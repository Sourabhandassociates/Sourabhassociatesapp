import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";
import { PaginationControls } from "../../components/PaginationControls";
import { useAccountsPermissions } from "../../hooks/useAccountsPermissions";

interface CaseRow {
  id: string;
  matterNumber: string;
  courtCaseNumber: string | null;
  /** New Case form simplification (2026-08-11) — title/practiceArea are now optional. */
  title: string | null;
  practiceArea: string | null;
  status: string;
  partner: { name: string };
}

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
const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"];

export default function CaseList() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [search, setSearch] = useState("");
  /** Milestone 1 (Version 1.0 completion, SRD Section 10.1 — "Bulk filtering/search by
   * ... tag"). */
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();
  /** ACCOUNTS module — Overview/Expenses completion pass (2026-08-15, §7/§8). "Cases
   * → Select Case → Add Expense" is the primary workflow for case-wise expenses —
   * no manual client/case selection, both are already known from this row. */
  const { permissions: accountsPermissions } = useAccountsPermissions();
  const [expenseForCase, setExpenseForCase] = useState<CaseRow | null>(null);

  function load(q = search, t = tag, p = page, ps = pageSize) {
    api
      .get("/cases", { params: { ...(q ? { search: q } : {}), ...(t ? { tag: t } : {}), page: p, pageSize: ps } })
      .then((res) => {
        setCases(res.data);
        setTotal(Number(res.headers["x-total-count"] ?? res.data.length));
      });
  }

  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="page-header">
        <h1>Cases</h1>
        <button className="primary" onClick={() => navigate("/cases/new")}>
          + New Case
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <label htmlFor="caseSearch">Search</label>
          <input
            id="caseSearch"
            placeholder="Search by Matter Number, court case number, or title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              load(e.target.value, tag, 1);
            }}
            style={{ maxWidth: 400 }}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="caseTagFilter">Tag</label>
          <SearchableSelect
            id="caseTagFilter"
            category="TAG"
            value={tag}
            onChange={(v) => {
              setTag(v);
              setPage(1);
              load(search, v, 1);
            }}
          />
        </div>
      </div>

      {expenseForCase && (
        <CaseQuickExpenseForm
          caseRow={expenseForCase}
          onDone={() => setExpenseForCase(null)}
          onCancel={() => setExpenseForCase(null)}
        />
      )}

      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Matter Number</th>
            <th>Court Case No.</th>
            <th>Title</th>
            <th>Practice Area</th>
            <th>Partner</th>
            <th>Status</th>
            {accountsPermissions.createExpense && <th></th>}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => navigate(`/cases/${c.id}`)}>
              <td>{c.matterNumber}</td>
              <td>{c.courtCaseNumber ?? "—"}</td>
              <td>{c.title ?? "—"}</td>
              <td>{c.practiceArea ?? "—"}</td>
              <td>{c.partner.name}</td>
              <td>
                <span className={`badge status-${c.status}`}>{c.status}</span>
              </td>
              {accountsPermissions.createExpense && (
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="secondary"
                    onClick={() => setExpenseForCase(c)}
                  >
                    Add Expense
                  </button>
                </td>
              )}
            </tr>
          ))}
          {cases.length === 0 && (
            <tr>
              <td colSpan={accountsPermissions.createExpense ? 7 : 6} className="muted">
                No cases yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => {
          setPage(p);
          load(search, tag, p);
        }}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
          load(search, tag, 1, ps);
        }}
      />
    </div>
  );
}

/** ACCOUNTS module — Overview/Expenses completion pass (2026-08-15, §7-§9). Client
 * and Case are read-only, pre-attached from the row that opened this form — no
 * dropdown to reselect them, matching the spec's explicit "must NOT ask the user to
 * select the client or case again." Posts straight to POST /accounts/expenses (the
 * same ACCOUNTS.CREATE_EXPENSE-gated endpoint the Accounts → Expenses panel uses),
 * so nothing about the Cases module's own routes/permissions changes. */
function CaseQuickExpenseForm({
  caseRow,
  onDone,
  onCancel,
}: {
  caseRow: CaseRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [clientNames, setClientNames] = useState<string | null>(null);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Best-effort client-name lookup for read-only display only — submission below
    // only needs ACCOUNTS.CREATE_EXPENSE, so this gracefully degrades to "—" for an
    // actor who holds CREATE_EXPENSE but not the broader ACCOUNTS.VIEW this
    // case-accounts endpoint requires.
    api
      .get(`/cases/${caseRow.id}/accounts`)
      .then((res) => {
        if (cancelled) return;
        const names = (res.data.clients as { name: string }[]).map((c) => c.name).join(", ");
        setClientNames(names || "—");
      })
      .catch(() => {
        if (!cancelled) setClientNames("—");
      });
    return () => {
      cancelled = true;
    };
  }, [caseRow.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("caseId", caseRow.id);
      form.append("category", category);
      form.append("amount", amount);
      form.append("date", new Date(date).toISOString());
      form.append("paymentMode", paymentMode);
      if (vendor) form.append("vendor", vendor);
      if (description) form.append("description", description);
      if (receiptFile) form.append("file", receiptFile);
      await api.post("/accounts/expenses", form, { headers: { "Content-Type": "multipart/form-data" } });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add expense"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Add Expense — {caseRow.matterNumber}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 6, columnGap: 16, marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: "0.85em" }}>
          Client
        </div>
        <div>{clientNames ?? "Loading…"}</div>
        <div className="muted" style={{ fontSize: "0.85em" }}>
          Case
        </div>
        <div>{caseRow.matterNumber}</div>
      </div>
      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label>Expense Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
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
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Expense"}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
