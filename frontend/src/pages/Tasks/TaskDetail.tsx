import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";

interface TaskDetailData {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string };
  assignedBy: { id: string; name: string };
  /** New Case form simplification (2026-08-11) — case title is now optional. */
  case: { id: string; matterNumber: string; title: string | null };
}
interface HistoryEntry {
  id: string;
  action: string;
  details: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: "Created",
  TASK_REASSIGNED: "Reassigned",
  TASK_STATUS_CHANGED: "Status changed",
  TASK_UPDATED: "Edited",
};

function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** Firm-wide audit trail expansion (2026-08-13) — TASK_UPDATED entries (plain
 * title/description/priority/dueDate edits) carry a structured `changes` diff rather
 * than a hand-built `details` string; rendered as a compact inline summary so it reads
 * naturally next to the pre-existing reassignment/status-change entries above, which
 * keep using their own `details` text unchanged. */
function formatChanges(changes: Record<string, { old: unknown; new: unknown }>): string {
  return Object.entries(changes)
    .map(([field, { old: oldValue, new: newValue }]) => `${field}: ${formatDiffValue(oldValue)} → ${formatDiffValue(newValue)}`)
    .join("; ");
}

/** SRD Step 1 second revision (item 1) — Task History: full audit trail for one task,
 * reconstructed from the generic Audit Log rather than a task-specific history table. */
export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    api.get(`/tasks/${id}`).then((res) => {
      setTask(res.data.task);
      setHistory(res.data.history);
    });
  }, [id]);

  if (!task) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{task.title}</h1>
      </div>

      <div className="card">
        <h3>Task Details</h3>
        <p>
          <strong>Case:</strong> <Link to={`/cases/${task.case.id}`}>{task.case.matterNumber}</Link>
          {task.case.title ? ` — ${task.case.title}` : ""}
        </p>
        <p>
          <strong>Description:</strong> {task.description || "—"}
        </p>
        <p>
          <strong>Priority:</strong> {task.priority}
        </p>
        <p>
          <strong>Status:</strong> <span className="badge">{task.status.replaceAll("_", " ")}</span>
        </p>
        <p>
          <strong>Due Date:</strong> {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
        </p>
        <p>
          <strong>Assigned To:</strong> {task.assignedTo.name}
        </p>
        <p>
          <strong>Created By:</strong> {task.assignedBy.name}
        </p>
        <p>
          <strong>Completed:</strong>{" "}
          {task.completedAt ? new Date(task.completedAt).toLocaleString() : "—"}
        </p>
      </div>

      <div className="card">
        <h3>Task History</h3>
        {history.length === 0 && <p className="muted">No history recorded yet.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {history.map((h) => (
            <li key={h.id} style={{ borderBottom: "1px solid var(--color-border)", padding: "10px 0" }}>
              <p style={{ margin: 0 }}>
                <strong>{ACTION_LABELS[h.action] ?? h.action}</strong>
                {h.details ? ` — ${h.details}` : ""}
                {h.changes ? ` — ${formatChanges(h.changes)}` : ""}
              </p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85em" }}>
                {h.user?.name ?? "System"} · {new Date(h.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
