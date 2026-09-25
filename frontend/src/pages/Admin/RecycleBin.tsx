import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

interface RecycleBinEntry {
  entityType: "Case" | "Client" | "Document" | "Task";
  id: string;
  label: string;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
}

/** SRD Section 27 — Recycle Bin, Managing-Partner-only: view/restore/permanently
 * delete every soft-deleted Case/Client/Document/Task in one place. */
export default function RecycleBin() {
  const [entries, setEntries] = useState<RecycleBinEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/recycle-bin").then((res) => setEntries(res.data));
  }
  useEffect(() => load(), []);

  async function restore(entry: RecycleBinEntry) {
    setError(null);
    try {
      await api.post(`/recycle-bin/${entry.entityType}/${entry.id}/restore`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to restore record"));
    }
  }

  async function permanentlyDelete(entry: RecycleBinEntry) {
    if (
      !window.confirm(
        `Permanently delete "${entry.label}"? This cannot be undone — the record and everything linked to it will be gone for good.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/recycle-bin/${entry.entityType}/${entry.id}`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to permanently delete record"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Recycle Bin</h1>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Record</th>
              <th>Deleted By</th>
              <th>Deleted At</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.entityType}-${e.id}`}>
                <td>
                  <span className="badge">{e.entityType}</span>
                </td>
                <td>{e.label}</td>
                <td>{e.deletedBy?.name ?? "—"}</td>
                <td>{new Date(e.deletedAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => restore(e)}>Restore</button>
                  <button onClick={() => permanentlyDelete(e)}>Permanently Delete</button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  The Recycle Bin is empty.
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
