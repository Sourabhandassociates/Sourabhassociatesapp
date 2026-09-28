import { useRef, useState } from "react";
import { api } from "../../api/client";
import { downloadFile } from "../../utils/downloadFile";
import { Breadcrumbs } from "../../components/Breadcrumbs";

type EntityType = "clients" | "contacts" | "matters";

interface ConflictMatch {
  type: string;
  label: string;
  confidence: string;
}

interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  conflicts: ConflictMatch[];
}

interface CommitResult {
  createdCount: number;
  skipped: { rowNumber: number; reason: string }[];
}

const ENTITY_LABELS: Record<EntityType, string> = {
  clients: "Clients",
  contacts: "Contacts",
  matters: "Matters (Cases)",
};

/** SRD Section 25 — Data Import & Export. Template download -> upload -> validation
 * preview -> confirm -> commit, restricted to Managing Partner/Office Staff
 * (DATA_IMPORT.RUN). A row with a possible conflict-check match or a validation error
 * is shown but never auto-created on commit — see dataImport.service.ts's
 * module-level comment for why. */
export default function DataImport() {
  const [entityType, setEntityType] = useState<EntityType>("clients");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    downloadFile(`/data-import/${entityType}/template`, {}, `${entityType}-import-template.xlsx`);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ rows: ParsedRow[] }>(`/data-import/${entityType}/preview`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setRows(res.data.rows);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message ?? "Failed to parse the uploaded file");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onCommit() {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post<CommitResult>(`/data-import/${entityType}/commit`, { rows });
      setResult(res.data);
      setRows(null);
    } catch {
      setError("Import failed");
    } finally {
      setBusy(false);
    }
  }

  const importableCount = rows?.filter((r) => r.errors.length === 0 && r.conflicts.length === 0).length ?? 0;
  const blockedCount = (rows?.length ?? 0) - importableCount;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Admin Settings", to: "/admin/dropdowns" },
          { label: "Utilities", to: "/admin/utilities" },
          { label: "Data Import" },
        ]}
      />
      <div className="page-header">
        <h1>Data Import</h1>
      </div>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div>
          <label htmlFor="entityType">What are you importing?</label>
          <select
            id="entityType"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as EntityType);
              setRows(null);
              setResult(null);
            }}
          >
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-actions" style={{ marginBottom: 20 }}>
        <button type="button" className="secondary" onClick={downloadTemplate}>
          Download Template
        </button>
        <label className="secondary" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          Upload Filled Template
          <input ref={fileInputRef} type="file" accept=".xlsx" onChange={onFileSelected} style={{ display: "none" }} />
        </label>
      </div>

      {busy && <p className="muted">Working…</p>}
      {error && <p className="error-text">{error}</p>}

      {result && (
        <div className="card">
          <h3>Import Complete</h3>
          <p>
            <strong>{result.createdCount}</strong> record(s) created.
          </p>
          {result.skipped.length > 0 && (
            <>
              <p className="muted">{result.skipped.length} row(s) skipped:</p>
              <ul>
                {result.skipped.map((s) => (
                  <li key={s.rowNumber} className="muted">
                    Row {s.rowNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {rows && (
        <div className="card">
          <h3>Validation Preview</h3>
          <p className="muted">
            {importableCount} row(s) ready to import. {blockedCount} row(s) blocked (see below) — fix and re-upload, or
            create those individually.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Summary</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{Object.values(row.data).filter(Boolean).slice(0, 3).join(" — ")}</td>
                    <td>
                      {row.errors.length === 0 && row.conflicts.length === 0 && <span className="badge status-ACTIVE">Ready</span>}
                      {row.errors.map((e, i) => (
                        <div key={i} className="error-text">
                          {e}
                        </div>
                      ))}
                      {row.conflicts.length > 0 && (
                        <div className="error-text">
                          Possible conflict: {row.conflicts.map((c) => c.label).join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="primary" onClick={onCommit} disabled={importableCount === 0 || busy}>
              Confirm &amp; Import {importableCount} Record(s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
