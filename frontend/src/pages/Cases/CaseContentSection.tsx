import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { RichTextEditor } from "../../components/RichTextEditor";

/**
 * Facts & Arguments case sections (2026-08-18) — one shared component for both,
 * since the two are functionally identical (a single current rich-text value
 * per Case, Edit → Save workflow, same permission-per-section shape) and differ
 * only in which field/endpoint/labels they use. `section` drives both the API
 * path (`/cases/:id/facts` or `/cases/:id/arguments`) and the response field
 * names, which the backend returns as `{ [section]: string|null,
 * [section]UpdatedAt: string|null, [section]UpdatedBy: {id,name}|null }` —
 * exactly mirroring the Prisma column names, so no per-section response
 * mapping is needed here.
 */
interface CaseContentResponse {
  content: string | null;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}

function parseResponse(section: "facts" | "arguments", raw: Record<string, unknown>): CaseContentResponse {
  return {
    content: (raw[section] as string | null) ?? null,
    updatedAt: (raw[`${section}UpdatedAt`] as string | null) ?? null,
    updatedBy: (raw[`${section}UpdatedBy`] as { id: string; name: string } | null) ?? null,
  };
}

export function CaseContentSection({
  caseId,
  section,
  title,
  emptyMessage,
  addLabel,
}: {
  caseId: string;
  section: "facts" | "arguments";
  title: string;
  emptyMessage: string;
  addLabel: string;
}) {
  const [data, setData] = useState<CaseContentResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state — RichTextEditor is uncontrolled and reports live HTML on
  // every keystroke; storing it in a ref avoids re-rendering this whole section
  // (and therefore the editor) on every character typed (§19 — explicit Save,
  // no autosave, so nothing needs to react to this value changing mid-edit).
  const draftHtml = useRef("");

  const load = useCallback(() => {
    api.get(`/cases/${caseId}/${section}`).then((res) => setData(parseResponse(section, res.data)));
  }, [caseId, section]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing() {
    draftHtml.current = data?.content ?? "";
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/cases/${caseId}/${section}`, { content: draftHtml.current });
      setEditing(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, `Failed to save ${title}`));
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p>Loading…</p>;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!editing && (
          <button className="secondary" onClick={startEditing}>
            {data.content ? "Edit" : addLabel}
          </button>
        )}
      </div>

      {data.updatedAt && (
        <p className="muted" style={{ fontSize: "0.85em", marginTop: 4 }}>
          Last updated {new Date(data.updatedAt).toLocaleString()}
          {data.updatedBy ? ` by ${data.updatedBy.name}` : ""}
        </p>
      )}

      {editing ? (
        <div style={{ marginTop: 12 }}>
          {/* Remounted per edit session (key) so the uncontrolled editor always
              starts from the latest saved content, never stale in-memory state. */}
          <RichTextEditor
            key={data.content ?? ""}
            initialHtml={data.content ?? ""}
            onChange={(html) => {
              draftHtml.current = html;
            }}
          />
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : data.content ? (
        <div className="rich-text-content" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: data.content }} />
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
