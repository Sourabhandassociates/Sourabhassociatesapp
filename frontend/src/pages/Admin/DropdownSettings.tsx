import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

interface PicklistValue {
  id: string;
  category: string;
  value: string;
  isActive: boolean;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "COURT", label: "Court" },
  { key: "JUDGE", label: "Judge" },
  { key: "CASE_STAGE", label: "Case Stage" },
  { key: "PRACTICE_AREA", label: "Practice Area" },
  { key: "CASE_TYPE", label: "Case Type" },
  { key: "OPPOSITE_COUNSEL", label: "Opposite Counsel" },
  { key: "OPPOSITE_PARTY", label: "Opposite Party" },
  { key: "DEPARTMENT", label: "Department" },
  { key: "HEARING_PURPOSE", label: "Hearing Purpose" },
  { key: "DOCUMENT_CATEGORY", label: "Document Category" },
  { key: "CLIENT_TYPE", label: "Client Type" },
  // Milestone 1 (Version 1.0 completion):
  { key: "CONTACT_CATEGORY", label: "Contact Category" },
  { key: "TAG", label: "Tag" },
  // Milestone 2 (Version 1.0 completion):
  { key: "EXPENSE_CATEGORY", label: "Expense Category" },
];

/** SRD Step 1 revision (item 8) — Managing Partner–only screen to manage every
 * admin-controlled dropdown's values from one place. */
export default function DropdownSettings() {
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [values, setValues] = useState<PicklistValue[]>([]);
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // includeInactive isn't exposed via query param on this endpoint by design (the
  // dropdown-population route only ever returns active values) — Admin Settings
  // shows only active values too, kept simple: deactivated values just stop
  // appearing here and in every dropdown, without a separate "show inactive" view.
  const load = useCallback(() => {
    api.get(`/picklists/${category}`).then((res) => setValues(res.data));
  }, [category]);
  useEffect(() => load(), [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/picklists/${category}`, { value: newValue });
      setNewValue("");
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add value"));
    }
  }

  async function deactivate(id: string) {
    await api.patch(`/picklists/values/${id}`, { isActive: false });
    load();
  }

  async function rename(id: string, current: string) {
    const next = window.prompt("Rename value to:", current);
    if (!next || next.trim() === current) return;
    await api.patch(`/picklists/values/${id}`, { value: next.trim() });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Admin Settings — Dropdown Values</h1>
      </div>

      <div className="tab-row" style={{ maxWidth: 900, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={category === c.key ? "active" : ""}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card">
        <h3>Add {CATEGORIES.find((c) => c.key === category)?.label} value</h3>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="newValue">Value</label>
            <input id="newValue" value={newValue} onChange={(e) => setNewValue(e.target.value)} required />
          </div>
          <button className="primary" type="submit">
            Add
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {values.map((v) => (
              <tr key={v.id}>
                <td>{v.value}</td>
                <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => rename(v.id, v.value)}>Rename</button>
                  <button onClick={() => deactivate(v.id)}>Deactivate</button>
                </td>
              </tr>
            ))}
            {values.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No values yet — add one above.
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
