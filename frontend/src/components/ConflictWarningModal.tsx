import { useState } from "react";
import { useAuth } from "../context/useAuth";

export interface ConflictMatch {
  type: "CLIENT" | "CONTACT" | "OPPOSITE_PARTY" | "OPPOSITE_COUNSEL";
  id: string;
  label: string;
  confidence: "HIGH" | "MEDIUM";
}

const TYPE_LABELS: Record<ConflictMatch["type"], string> = {
  CLIENT: "Existing Client",
  CONTACT: "Contact Directory",
  OPPOSITE_PARTY: "Opposite Party (used on other matters)",
  OPPOSITE_COUNSEL: "Opposite Counsel (used on other matters)",
};

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 10.2 — Advanced Conflict Check).
 * Only a Managing Partner may acknowledge/override a possible match (the SRD's own
 * wording); everyone else sees the match list with no way to proceed and must escalate.
 */
export function ConflictWarningModal({
  matches,
  onCancel,
  onConfirm,
}: {
  matches: ConflictMatch[];
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { auth } = useAuth();
  const canOverride = auth?.role === "MANAGING_PARTNER";
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) {
      setError("A reason is required to proceed.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to proceed");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Possible Conflict of Interest</h3>
        <p className="subtitle">
          The name entered possibly matches {matches.length} existing record{matches.length > 1 ? "s" : ""}.
        </p>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          {matches.map((m, i) => (
            <li key={`${m.type}-${m.id}-${i}`}>
              <strong>{m.label}</strong> — {TYPE_LABELS[m.type]}{" "}
              <span className={`badge ${m.confidence === "HIGH" ? "status-BLACKLISTED" : "status-INTAKE"}`}>
                {m.confidence}
              </span>
            </li>
          ))}
        </ul>

        {canOverride ? (
          <>
            <label htmlFor="conflict-reason">Reason to proceed (required)</label>
            <textarea
              id="conflict-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this not an actual conflict?"
            />
            {error && <p className="error-text">{error}</p>}
            <div className="form-actions">
              <button className="secondary" onClick={onCancel} disabled={submitting}>
                Cancel
              </button>
              <button className="primary" onClick={submit} disabled={submitting}>
                {submitting ? "Saving…" : "Proceed Anyway"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="error-text">
              Only the Managing Partner can override a possible conflict match. Please escalate this to a
              Partner before proceeding.
            </p>
            <div className="form-actions">
              <button className="secondary" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
