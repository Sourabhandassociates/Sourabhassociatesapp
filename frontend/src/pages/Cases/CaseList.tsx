
import { FormEvent, useEffect, useRef, useState } from "react";
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
  caseType: string | null;
  title: string | null;
  status: string;
  courtNumber: string | null;
  courtName: string | null;
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

const PAYMENT_MODES = [
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "CARD",
  "OTHER",
];

export default function CaseList() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const navigate = useNavigate();

  const { permissions: accountsPermissions } =
    useAccountsPermissions();

  const [expenseForCase, setExpenseForCase] =
    useState<CaseRow | null>(null);

  async function load(
    q = search,
    t = tag,
    p = page,
    ps = pageSize
  ) {
    const currentRequest = ++requestId.current;

    setLoading(true);
    setError("");

    try {
      const res = await api.get("/cases", {
        params: {
          ...(q ? { search: q } : {}),
          ...(t ? { tag: t } : {}),
          page: p,
          pageSize: ps,
        },
      });

      if (currentRequest !== requestId.current) return;

      setCases(res.data);
      setTotal(
        Number(res.headers["x-total-count"] ?? res.data.length)
      );
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      setError(
        getErrorMessage(err, "Failed to load cases.")
      );
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();
    // Initial page load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryLoading() {
    load(search, tag, page, pageSize);
  }

  return (
    <div>
      {/* Loading spinner animation */}
      <style>
        {`
          @keyframes caseListSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      <div className="page-header">
        <h1>Cases</h1>

        <button
          className="primary"
          onClick={() => navigate("/cases/new")}
        >
          + New Case
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: 12,
        }}
      >
        <div>
          <label htmlFor="caseSearch">Search</label>

          <input
            id="caseSearch"
            placeholder="Search by Case Type, court case number, or title…"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setPage(1);
              load(value, tag, 1, pageSize);
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
              load(search, v, 1, pageSize);
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
              <th>Case Type</th>
              <th>Court Case No.</th>
              <th>Title</th>
              <th>Court No</th>
              <th>Court Complex</th>
              <th>Status</th>
              {accountsPermissions.createExpense && <th></th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={
                    accountsPermissions.createExpense ? 7 : 6
                  }
                  style={{
                    textAlign: "center",
                    padding: "45px 20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        border: "4px solid #e5e7eb",
                        borderTop: "4px solid #2563eb",
                        borderRadius: "50%",
                        animation: "caseListSpin 0.8s linear infinite",
                      }}
                    />

                    <strong
                      style={{
                        fontSize: 15,
                        color: "#374151",
                      }}
                    >
                      Loading cases...
                    </strong>

                    <span
                      style={{
                        fontSize: 13,
                        color: "#6b7280",
                      }}
                    >
                      Please wait while we fetch your information.
                    </span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={
                    accountsPermissions.createExpense ? 7 : 6
                  }
                  style={{
                    textAlign: "center",
                    padding: 35,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <strong style={{ color: "#dc2626" }}>
                      Unable to load cases
                    </strong>

                    <span
                      style={{
                        color: "#6b7280",
                        fontSize: 13,
                      }}
                    >
                      {error}
                    </span>

                    <button
                      type="button"
                      className="primary"
                      onClick={retryLoading}
                    >
                      Try Again
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="clickable"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <td>{c.caseType ?? "—"}</td>
                    <td>{c.courtCaseNumber ?? "—"}</td>
                    <td>{c.title ?? "—"}</td>
                    <td>{c.courtNumber ?? "_"}</td>
                    <td>{c.courtName ?? "—"}</td>

                    <td>
                      <span
                        className={`badge status-${c.status}`}
                      >
                        {c.status}
                      </span>
                    </td>

                    {accountsPermissions.createExpense && (
                      <td
                        onClick={(e) => e.stopPropagation()}
                      >
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
                    <td
                      colSpan={
                        accountsPermissions.createExpense ? 7 : 6
                      }
                      className="muted"
                    >
                      No cases found.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => {
            setPage(p);
            load(search, tag, p, pageSize);
          }}
          onPageSizeChange={(ps) => {
            setPageSize(ps);
            setPage(1);
            load(search, tag, 1, ps);
          }}
        />
      )}
    </div>
  );
}

/** ACCOUNTS module — Quick Expense Form */
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
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setClientNames(null);

    api
      .get(`/cases/${caseRow.id}/accounts`)
      .then((res) => {
        if (cancelled) return;

        const names = (
          res.data.clients as { name: string }[]
        )
          .map((c) => c.name)
          .join(", ");

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

      await api.post("/accounts/expenses", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      onDone();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to add expense")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Add Expense — {caseRow.matterNumber}</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          rowGap: 6,
          columnGap: 16,
          marginBottom: 12,
        }}
      >
        <div className="muted" style={{ fontSize: "0.85em" }}>
          Client
        </div>

        <div>
          {clientNames === null ? (
            <span
              style={{
                color: "#6b7280",
                fontSize: 13,
              }}
            >
              Loading client information...
            </span>
          ) : (
            clientNames
          )}
        </div>

        <div className="muted" style={{ fontSize: "0.85em" }}>
          Case
        </div>

        <div>{caseRow.matterNumber}</div>
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label>Expense Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label>Expense Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Amount</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div>
          <label>Payment Mode</label>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Paid To / Vendor</label>
          <input
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>

        <div>
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label>Receipt / Bill Upload (optional)</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff"
            onChange={(e) =>
              setReceiptFile(e.target.files?.[0] ?? null)
            }
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Expense"}
          </button>

          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
