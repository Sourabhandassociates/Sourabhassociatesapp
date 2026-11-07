
import { useCallback, useEffect, useState } from "react";
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

function formatChanges(
  changes: Record<string, { old: unknown; new: unknown }>
): string {
  return Object.entries(changes)
    .map(
      ([field, { old: oldValue, new: newValue }]) =>
        `${field}: ${formatDiffValue(oldValue)} → ${formatDiffValue(newValue)}`
    )
    .join("; ");
}

export default function TaskDetail() {
  const { id } = useParams();

  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTask = useCallback(async () => {
    if (!id) {
      setError("Task ID is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.get(`/tasks/${id}`);
      setTask(res.data.task);
      setHistory(res.data.history ?? []);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load task details. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;

    const fetchTask = async () => {
      if (!id) {
        if (active) {
          setError("Task ID is missing.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await api.get(`/tasks/${id}`);

        if (active) {
          setTask(res.data.task);
          setHistory(res.data.history ?? []);
        }
      } catch (err: any) {
        if (active) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Unable to load task details. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchTask();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes taskDetailSpin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        <div
          style={{
            minHeight: "300px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "40px 20px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              border: "4px solid var(--color-border, #e5e7eb)",
              borderTopColor: "var(--color-primary, #2563eb)",
              borderRadius: "50%",
              animation: "taskDetailSpin 0.8s linear infinite",
            }}
          />

          <h3 style={{ margin: "18px 0 6px" }}>Loading...</h3>

          <p className="muted" style={{ margin: 0 }}>
            Please wait while we fetch your information.
          </p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "300px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "40px 20px",
        }}
      >
        <h3>Unable to Load Task</h3>

        <p className="muted">{error}</p>

        <button
          type="button"
          className="primary"
          onClick={loadTask}
          disabled={loading}
          style={{ marginTop: "12px" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!task) {
    return <p className="muted">Task not found.</p>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>{task.title}</h1>
      </div>

      <div className="card">
        <h3>Task Details</h3>

        <p>
          <strong>Case:</strong>{" "}
          <Link to={`/cases/${task.case.id}`}>
            {task.case.matterNumber}
          </Link>
          {task.case.title ? ` — ${task.case.title}` : ""}
        </p>

        <p>
          <strong>Description:</strong> {task.description || "—"}
        </p>

        <p>
          <strong>Priority:</strong> {task.priority}
        </p>

        <p>
          <strong>Status:</strong>{" "}
          <span className="badge">
            {task.status.replaceAll("_", " ")}
          </span>
        </p>

        <p>
          <strong>Due Date:</strong>{" "}
          {task.dueDate
            ? new Date(task.dueDate).toLocaleDateString()
            : "—"}
        </p>

        <p>
          <strong>Assigned To:</strong> {task.assignedTo.name}
        </p>

        <p>
          <strong>Created By:</strong> {task.assignedBy.name}
        </p>

        <p>
          <strong>Completed:</strong>{" "}
          {task.completedAt
            ? new Date(task.completedAt).toLocaleString()
            : "—"}
        </p>
      </div>

      <div className="card">
        <h3>Task History</h3>

        {history.length === 0 && (
          <p className="muted">No history recorded yet.</p>
        )}

        <ul style={{ listStyle: "none", padding: 0 }}>
          {history.map((h) => (
            <li
              key={h.id}
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "10px 0",
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>
                  {ACTION_LABELS[h.action] ?? h.action}
                </strong>

                {h.details ? ` — ${h.details}` : ""}

                {h.changes
                  ? ` — ${formatChanges(h.changes)}`
                  : ""}
              </p>

              <p
                className="muted"
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.85em",
                }}
              >
                {h.user?.name ?? "System"} ·{" "}
                {new Date(h.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
