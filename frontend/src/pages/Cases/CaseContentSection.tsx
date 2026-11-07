
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { RichTextEditor } from "../../components/RichTextEditor";

interface CaseContentResponse {
  content: string | null;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}

function parseResponse(
  section: "facts" | "arguments",
  raw: Record<string, unknown>
): CaseContentResponse {
  return {
    content: (raw[section] as string | null) ?? null,
    updatedAt: (raw[`${section}UpdatedAt`] as string | null) ?? null,
    updatedBy:
      (raw[`${section}UpdatedBy`] as {
        id: string;
        name: string;
      } | null) ?? null,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const draftHtml = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/cases/${caseId}/${section}`);
      setData(parseResponse(section, res.data));
    } catch (err) {
      setError(getErrorMessage(err, `Failed to load ${title}`));
    } finally {
      setLoading(false);
    }
  }, [caseId, section, title]);

  useEffect(() => {
    load();
  }, [load, retryCount]);

  function startEditing() {
    draftHtml.current = data?.content ?? "";
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      await api.patch(`/cases/${caseId}/${section}`, {
        content: draftHtml.current,
      });

      setEditing(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, `Failed to save ${title}`));
    } finally {
      setSaving(false);
    }
  }

  // Inline loading spinner
  const Loader = ({ message }: { message: string }) => (
    <div
      style={{
        minHeight: 160,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          border: "3px solid var(--color-border-strong)",
          borderTop: "3px solid var(--color-primary)",
          borderRadius: "50%",
          animation: "caseContentLoaderSpin 0.8s linear infinite",
        }}
      />

      <style>
        {`
          @keyframes caseContentLoaderSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      <p className="muted" style={{ margin: 0 }}>
        {message}
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="card">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <Loader message={`Loading ${title.toLowerCase()}...`} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card">
        <h3 style={{ margin: 0 }}>{title}</h3>

        <div
          style={{
            minHeight: 140,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            textAlign: "center",
          }}
        >
          <p className="error-text" style={{ margin: 0 }}>
            {error}
          </p>

          <button
            className="primary"
            onClick={() => setRetryCount((prev) => prev + 1)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>

        {!editing && (
          <button className="secondary" onClick={startEditing}>
            {data.content ? "Edit" : addLabel}
          </button>
        )}
      </div>

      {data.updatedAt && (
        <p
          className="muted"
          style={{ fontSize: "0.85em", marginTop: 4 }}
        >
          Last updated {new Date(data.updatedAt).toLocaleString()}
          {data.updatedBy ? ` by ${data.updatedBy.name}` : ""}
        </p>
      )}

      {editing ? (
        <div style={{ marginTop: 12 }}>
          <RichTextEditor
            key={data.content ?? ""}
            initialHtml={data.content ?? ""}
            onChange={(html) => {
              draftHtml.current = html;
            }}
          />

          {error && (
            <p className="error-text" style={{ marginTop: 8 }}>
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <button
              className="primary"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {saving && (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderTop: "2px solid white",
                    borderRadius: "50%",
                    animation:
                      "caseContentLoaderSpin 0.8s linear infinite",
                  }}
                />
              )}
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : data.content ? (
        <div
          className="rich-text-content"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
