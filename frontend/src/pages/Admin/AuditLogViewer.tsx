import { Fragment, useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";

interface AuditLogChange {
  old: unknown;
  new: unknown;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  changes: Record<string, AuditLogChange> | null;
  userRole: string | null;
  createdAt: string;
  user: { id: string; name: string; role: string } | null;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/** Milestone 4 (Version 1.0 completion, SRD Section 24/29 — Audit Log Viewer), expanded
 * into a firm-wide audit trail (2026-08-13): date-range/user filters that the backend
 * already supported were previously hidden from this screen; entityName search and a
 * per-row structured before/after diff are new. Managing Partner (AUDIT_LOG.VIEW_ALL)
 * sees every entry firm-wide; Accounts Team (AUDIT_LOG.VIEW_OWN) sees only their own
 * actions — the backend enforces the scope, this screen just renders whatever it's
 * handed. The `action` filter stays free-text `contains` rather than a dropdown —
 * action strings span 60+ ad-hoc values across every module with no central catalogue
 * (unlike Permission keys), so a maintained dropdown would be disproportionate scope
 * for what a substring search already covers. */
export default function AuditLogViewer() {
  const { auth } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityName, setEntityName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userId, setUserId] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 50;

  const isFirmWide = auth?.role === "MANAGING_PARTNER";

  function load(p = page) {
    api
      .get("/audit-log", {
        params: {
          page: p,
          pageSize,
          ...(entityType ? { entityType } : {}),
          ...(action ? { action } : {}),
          ...(entityName ? { entityName } : {}),
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(isFirmWide && userId ? { userId } : {}),
        },
      })
      .then((res) => {
        setEntries(res.data.entries);
        setTotal(res.data.total);
      });
  }

  useEffect(() => {
    load(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, action, entityName, startDate, endDate, userId]);

  useEffect(() => {
    if (isFirmWide) api.get("/auth/staff-directory").then((res) => setStaff(res.data));
  }, [isFirmWide]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        {isFirmWide ? "Every action recorded firm-wide." : "Your own recorded actions."}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <label htmlFor="entityTypeFilter">Entity Type</label>
          <input
            id="entityTypeFilter"
            placeholder="e.g. Case, Client, Task…"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{ maxWidth: 160 }}
          />
        </div>
        <div>
          <label htmlFor="entityNameFilter">Entity Name / Reference</label>
          <input
            id="entityNameFilter"
            placeholder="e.g. a matter number, client ID…"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>
        <div>
          <label htmlFor="actionFilter">Action</label>
          <input
            id="actionFilter"
            placeholder="e.g. CREATED, DELETED…"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ maxWidth: 180 }}
          />
        </div>
        {isFirmWide && (
          <div>
            <label htmlFor="userFilter">User</label>
            <select id="userFilter" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">All users</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="startDateFilter">From</label>
          <input
            id="startDateFilter"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ maxWidth: 160 }}
          />
        </div>
        <div>
          <label htmlFor="endDateFilter">To</label>
          <input
            id="endDateFilter"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ maxWidth: 160 }}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>When</th>
              {isFirmWide && <th>User</th>}
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const isExpanded = expandedId === e.id;
              const hasDetail = !!(e.changes && Object.keys(e.changes).length > 0);
              return (
                <Fragment key={e.id}>
                  <tr
                    className={hasDetail ? "clickable" : undefined}
                    onClick={hasDetail ? () => setExpandedId(isExpanded ? null : e.id) : undefined}
                  >
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    {isFirmWide && (
                      <td>
                        {e.user
                          ? `${e.user.name} (${(e.userRole ?? e.user.role).replaceAll("_", " ")})`
                          : "—"}
                      </td>
                    )}
                    <td>
                      <span className="badge">{e.action}</span>
                    </td>
                    <td>
                      {e.entityType}
                      {e.entityName ? `: ${e.entityName}` : e.entityId ? ` #${e.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td>
                      {e.details ?? (hasDetail ? "" : "—")}
                      {hasDetail && (
                        <span className="muted" style={{ marginLeft: e.details ? 8 : 0 }}>
                          {isExpanded ? "▲ hide changes" : "▼ show changes"}
                        </span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDetail && (
                    <tr>
                      <td colSpan={isFirmWide ? 5 : 4} style={{ padding: 0 }}>
                        <table className="audit-log-diff-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Previous Value</th>
                              <th>New Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(e.changes!).map(([field, change]) => (
                              <tr key={field}>
                                <td>{field}</td>
                                <td>{formatValue(change.old)}</td>
                                <td>{formatValue(change.new)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={isFirmWide ? 5 : 4} className="muted">
                  No audit log entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button
          disabled={page <= 1}
          onClick={() => {
            setPage(page - 1);
            load(page - 1);
          }}
        >
          Previous
        </button>
        <span className="muted">
          Page {page} of {totalPages} ({total} total)
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => {
            setPage(page + 1);
            load(page + 1);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
