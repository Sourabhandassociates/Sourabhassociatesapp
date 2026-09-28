import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

/**
 * Step 3 M4 — Role & Permission Management (STEP3_ROLE_PERMISSION_DESIGN.md
 * Section 6). Three tabs backed by the M3 admin API (`/api/permissions/*`):
 * Role Defaults (the editable matrix), Employee Overrides (search an employee,
 * grant/revoke/remove/reset), and Permission Summary (the same data, read-only).
 * Every enforcement decision (Rule A/Rule B, MP-only access) happens on the
 * backend — this screen's locked checkboxes/disabled buttons are a UX courtesy
 * that mirrors what the backend will do, never a substitute for it (design doc
 * Section 9.1); every mutation re-fetches from the server rather than trusting
 * client-side state, so "effective permissions" shown here are never stale.
 */

interface Permission {
  id: string;
  key: string;
  label: string;
  module: string;
  isCoreAdmin: boolean;
  isViewScope: boolean;
}
interface RoleDefaultRow {
  role: string;
  granted: boolean;
  updatedAt: string;
  permission: Permission;
}
interface StaffMember {
  id: string;
  name: string;
  role: string;
}
interface OverrideInfo {
  effect: "GRANT" | "REVOKE";
  reason: string;
  setBy: { id: string; name: string };
  setAt: string;
}
interface EffectiveEntry {
  permission: Pick<Permission, "id" | "key" | "label" | "module" | "isCoreAdmin">;
  roleDefault: boolean;
  override: OverrideInfo | null;
  granted: boolean;
  source: "role-default" | "override";
}
interface EmployeeSummary {
  user: { id: string; name: string; email: string; role: string; status: string };
  effective: EffectiveEntry[];
}

const ROLES = ["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE", "OFFICE_STAFF", "ACCOUNTS_TEAM"] as const;
const ROLE_LABELS: Record<string, string> = {
  MANAGING_PARTNER: "Managing Partner",
  ASSOCIATE: "Associate",
  JUNIOR_ASSOCIATE: "Junior Associate",
  OFFICE_STAFF: "Office Staff",
  ACCOUNTS_TEAM: "Accounts Team",
};

function moduleLabel(module: string): string {
  return module
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function groupByModule<T extends { permission: { module: string } }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.permission.module) ?? [];
    list.push(row);
    groups.set(row.permission.module, list);
  }
  return [...groups.entries()];
}

export default function PermissionManagement() {
  const [tab, setTab] = useState<"role-defaults" | "employee-overrides" | "permission-summary">("role-defaults");

  return (
    <div>
      <div className="page-header">
        <h1>Role & Permission Management</h1>
      </div>
      <div className="tab-row">
        <button className={tab === "role-defaults" ? "active" : ""} onClick={() => setTab("role-defaults")}>
          Role Defaults
        </button>
        <button className={tab === "employee-overrides" ? "active" : ""} onClick={() => setTab("employee-overrides")}>
          Employee Overrides
        </button>
        <button className={tab === "permission-summary" ? "active" : ""} onClick={() => setTab("permission-summary")}>
          Permission Summary
        </button>
      </div>
      {tab === "role-defaults" && <RoleDefaultsTab />}
      {tab === "employee-overrides" && <EmployeeOverridesTab />}
      {tab === "permission-summary" && <PermissionSummaryTab />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Role Defaults                                                            */
/* ------------------------------------------------------------------------ */

interface PermissionMatrixRow {
  permission: Permission;
  grants: Record<string, boolean>;
}

function RoleDefaultsTab() {
  const [rows, setRows] = useState<RoleDefaultRow[] | null>(null);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map()); // "ROLE:PERMISSION.KEY" -> staged value
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .get("/permissions/role-defaults")
      .then((res) => setRows(res.data))
      .catch((err) => setError(getErrorMessage(err, "Failed to load role defaults")));
  }, []);
  useEffect(() => load(), [load]);

  const matrixRows = useMemo<PermissionMatrixRow[]>(() => {
    if (!rows) return [];
    const byPermission = new Map<string, PermissionMatrixRow>();
    for (const row of rows) {
      const existing = byPermission.get(row.permission.id);
      if (existing) {
        existing.grants[row.role] = row.granted;
      } else {
        byPermission.set(row.permission.id, { permission: row.permission, grants: { [row.role]: row.granted } });
      }
    }
    return [...byPermission.values()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matrixRows;
    return matrixRows.filter(
      (r) =>
        r.permission.key.toLowerCase().includes(q) ||
        r.permission.label.toLowerCase().includes(q) ||
        r.permission.module.toLowerCase().includes(q)
    );
  }, [matrixRows, search]);

  const grouped = useMemo(() => groupByModule(filtered), [filtered]);

  function cellKey(role: string, permissionKey: string) {
    return `${role}:${permissionKey}`;
  }

  function isLocked(role: string, permission: Permission) {
    return role === "MANAGING_PARTNER" && permission.isCoreAdmin;
  }

  function currentValue(role: string, row: PermissionMatrixRow): boolean {
    const key = cellKey(role, row.permission.key);
    return pending.has(key) ? pending.get(key)! : row.grants[role];
  }

  function toggle(role: string, row: PermissionMatrixRow) {
    if (isLocked(role, row.permission)) return;
    const key = cellKey(role, row.permission.key);
    const next = new Map(pending);
    const newValue = !currentValue(role, row);
    if (newValue === row.grants[role]) {
      next.delete(key); // reverted to original value — no longer a pending change
    } else {
      next.set(key, newValue);
    }
    setPending(next);
  }

  function cancel() {
    setPending(new Map());
  }

  async function save() {
    if (pending.size === 0) return;
    const count = pending.size;
    const confirmed = window.confirm(
      `Save ${count} permission change${count === 1 ? "" : "s"}? This changes what every user with the affected role(s) can do immediately.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const changes = [...pending.entries()].map(([key, granted]) => {
        const separatorIndex = key.indexOf(":");
        return { role: key.slice(0, separatorIndex), permissionKey: key.slice(separatorIndex + 1), granted };
      });
      const res = await api.patch("/permissions/role-defaults", { changes });
      setPending(new Map());
      setSuccess(`Saved ${res.data.updated} change${res.data.updated === 1 ? "" : "s"}.`);
      load();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return <p>Loading…</p>;

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}

      {pending.size > 0 && (
        <div className="banner">
          <span>
            {pending.size} unsaved change{pending.size === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <label htmlFor="permission-search">Search Permission</label>
        <input
          id="permission-search"
          placeholder="Search by key, label, or module…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {grouped.length === 0 && (
        <div className="card">
          <p className="muted">No permissions match this search.</p>
        </div>
      )}

      {grouped.map(([module, rowsInModule]) => (
        <details key={module} className="module-group" open>
          <summary>
            {moduleLabel(module)} ({rowsInModule.length})
          </summary>
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Permission</th>
                  {ROLES.map((role) => (
                    <th key={role}>{ROLE_LABELS[role]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsInModule.map((row) => (
                  <tr key={row.permission.id}>
                    <td>
                      {row.permission.label}
                      {row.permission.isCoreAdmin && (
                        <span
                          className="badge core-admin"
                          style={{ marginLeft: 8 }}
                          title="Core Admin — protected by Managing Partner Safety"
                        >
                          🔒 Core Admin
                        </span>
                      )}
                    </td>
                    {ROLES.map((role) => {
                      const locked = isLocked(role, row.permission);
                      const key = cellKey(role, row.permission.key);
                      const isPending = pending.has(key);
                      return (
                        <td key={role}>
                          <input
                            type="checkbox"
                            checked={currentValue(role, row)}
                            disabled={locked}
                            onChange={() => toggle(role, row)}
                            className={locked ? "locked-cell" : undefined}
                            title={locked ? "Required for Managing Partner Safety — cannot be removed" : undefined}
                          />
                          {isPending && (
                            <span className="badge pending-change" style={{ marginLeft: 6 }}>
                              unsaved
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared: employee search, header, and the effective-permissions table     */
/* ------------------------------------------------------------------------ */

function EmployeeSearch({ onSelect }: { onSelect: (employeeId: string) => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/auth/staff-directory").then((res) => setStaff(res.data));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? staff.filter((s) => s.name.toLowerCase().includes(q) || ROLE_LABELS[s.role]?.toLowerCase().includes(q))
    : staff;

  return (
    <div style={{ position: "relative", maxWidth: 380 }}>
      <label htmlFor="employee-search">Search Employee</label>
      <input
        id="employee-search"
        placeholder="Search by name or role…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            zIndex: 10,
            top: 62,
            left: 0,
            right: 0,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {filtered.map((s) => (
            <div
              key={s.id}
              className="searchable-select-option"
              onClick={() => {
                onSelect(s.id);
                setQuery(s.name);
                setOpen(false);
              }}
            >
              {s.name} <span className="muted">({ROLE_LABELS[s.role] ?? s.role})</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: "8px 12px" }}>
              No matches.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeHeader({ user }: { user: EmployeeSummary["user"] }) {
  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h3 style={{ margin: 0 }}>{user.name}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {user.email}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <span className="badge">{ROLE_LABELS[user.role] ?? user.role}</span>
        <span className={`badge status-${user.status}`}>{user.status}</span>
      </div>
    </div>
  );
}

function EffectivePermissionsTable({
  entries,
  employeeRole,
  showActions,
  onGrant,
  onRevoke,
  onRemove,
}: {
  entries: EffectiveEntry[];
  employeeRole: string;
  showActions: boolean;
  onGrant?: (entry: EffectiveEntry) => void;
  onRevoke?: (entry: EffectiveEntry) => void;
  onRemove?: (entry: EffectiveEntry) => void;
}) {
  const grouped = groupByModule(entries);

  return (
    <>
      {grouped.map(([module, entriesInModule]) => (
        <details key={module} className="module-group" open>
          <summary>
            {moduleLabel(module)} ({entriesInModule.length})
          </summary>
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Role Default</th>
                  <th>Override</th>
                  <th>Effective</th>
                  {showActions && <th></th>}
                </tr>
              </thead>
              <tbody>
                {entriesInModule.map((entry) => {
                  const revokeLocked = employeeRole === "MANAGING_PARTNER" && entry.permission.isCoreAdmin;
                  return (
                    <tr key={entry.permission.id}>
                      <td>
                        {entry.permission.label}
                        {entry.permission.isCoreAdmin && (
                          <span className="badge core-admin" style={{ marginLeft: 8 }} title="Core Admin">
                            🔒
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${entry.roleDefault ? "status-ACTIVE" : "status-ON_HOLD"}`}>
                          {entry.roleDefault ? "Granted" : "Denied"}
                        </span>
                      </td>
                      <td>
                        {entry.override ? (
                          <span
                            className={`badge override-${entry.override.effect.toLowerCase()}`}
                            title={`"${entry.override.reason}" — set by ${entry.override.setBy.name} on ${new Date(
                              entry.override.setAt
                            ).toLocaleString()}`}
                          >
                            {entry.override.effect === "GRANT" ? "Granted by override" : "Revoked by override"}
                          </span>
                        ) : (
                          <span className="muted">Inherited</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${entry.granted ? "status-ACTIVE" : "status-ON_HOLD"}`}>
                          {entry.granted ? "Allowed" : "Denied"}
                        </span>
                      </td>
                      {showActions && (
                        <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {entry.override ? (
                            <button className="secondary" onClick={() => onRemove?.(entry)}>
                              Remove Override
                            </button>
                          ) : (
                            <>
                              <button className="secondary" onClick={() => onGrant?.(entry)}>
                                Grant
                              </button>
                              <button
                                className="secondary"
                                disabled={revokeLocked}
                                title={revokeLocked ? "Cannot revoke a core-admin permission from a Managing Partner" : undefined}
                                onClick={() => onRevoke?.(entry)}
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </>
  );
}

function OverrideReasonDialog({
  entry,
  effect,
  onCancel,
  onConfirm,
}: {
  entry: EffectiveEntry;
  effect: "GRANT" | "REVOKE";
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save the override"));
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{effect === "GRANT" ? "Grant Override" : "Revoke Override"}</h3>
        <p className="subtitle">
          {entry.permission.label} ({entry.permission.key})
        </p>
        <label htmlFor="override-reason">Reason (required)</label>
        <textarea
          id="override-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this override needed?"
        />
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button className="primary" onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : `Confirm ${effect === "GRANT" ? "Grant" : "Revoke"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Case Section Access (2026-08-17)                                         */
/* ------------------------------------------------------------------------ */

/** The eight Case Detail tabs, in the order they appear on the Case page. Reuses
 * the exact same createOverride/removeOverride mechanism the generic table below
 * already drives — this is purely a friendlier, single-checkbox-per-section
 * presentation of the same eight entries, not a second permission system. */
const CASE_SECTION_ORDER: { key: string; label: string }[] = [
  { key: "CASE_OVERVIEW.VIEW", label: "Overview" },
  { key: "CASE_FACTS.VIEW", label: "Facts" },
  { key: "CASE_ARGUMENTS.VIEW", label: "Arguments" },
  { key: "CASE_DOCUMENTS.VIEW", label: "Documents" },
  { key: "CASE_TASKS.VIEW", label: "Tasks" },
  { key: "CASE_HEARINGS.VIEW", label: "Hearings" },
  { key: "CASE_TIMELINE.VIEW", label: "Timeline" },
  { key: "CASE_NOTES.VIEW", label: "Notes" },
  { key: "CASE_BILLING_EXPENSES.VIEW", label: "Billing / Expenses" },
  { key: "CASE_ACCOUNTS.VIEW", label: "Accounts" },
];
const CASE_SECTION_KEYS = new Set(CASE_SECTION_ORDER.map((s) => s.key));

function CaseSectionAccessCard({
  summary,
  onToggle,
}: {
  summary: EmployeeSummary;
  onToggle: (entry: EffectiveEntry) => void;
}) {
  const byKey = new Map(summary.effective.map((e) => [e.permission.key, e]));

  return (
    <div className="card">
      <h3>Case Section Access</h3>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Which tabs {summary.user.name} sees when opening a Case. Unchecking a box here creates an
        individual override for that section, same as Grant/Revoke below — it takes precedence over
        the {ROLE_LABELS[summary.user.role] ?? summary.user.role} role default.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CASE_SECTION_ORDER.map(({ key, label }) => {
          const entry = byKey.get(key);
          if (!entry) return null;
          const locked = summary.user.role === "MANAGING_PARTNER" && entry.permission.isCoreAdmin;
          return (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: locked ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={entry.granted}
                disabled={locked}
                onChange={() => onToggle(entry)}
                title={locked ? "Required for Managing Partner Safety — cannot be removed" : undefined}
              />
              <span>{label}</span>
              {locked && (
                <span className="badge core-admin" title="Core Admin — protected by Managing Partner Safety">
                  🔒
                </span>
              )}
              {!locked && entry.override && (
                <span
                  className={`badge override-${entry.override.effect.toLowerCase()}`}
                  title={`"${entry.override.reason}" — set by ${entry.override.setBy.name} on ${new Date(
                    entry.override.setAt
                  ).toLocaleString()}`}
                >
                  individual override
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Employee Overrides                                                       */
/* ------------------------------------------------------------------------ */

function EmployeeOverridesTab() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ entry: EffectiveEntry; effect: "GRANT" | "REVOKE" } | null>(null);

  const load = useCallback((id: string) => {
    setError(null);
    api
      .get(`/permissions/employees/${id}`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(getErrorMessage(err, "Failed to load employee")));
  }, []);

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setSummary(null);
    load(id);
  }

  function flashSuccess(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 4000);
  }

  async function handleGrantOrRevoke(reason: string) {
    if (!dialog || !employeeId) return;
    await api.post(`/permissions/employees/${employeeId}/overrides`, {
      permissionKey: dialog.entry.permission.key,
      effect: dialog.effect,
      reason,
    });
    setDialog(null);
    flashSuccess(`${dialog.effect === "GRANT" ? "Granted" : "Revoked"} ${dialog.entry.permission.label}.`);
    load(employeeId);
  }

  async function handleRemove(entry: EffectiveEntry) {
    if (!employeeId) return;
    if (!window.confirm(`Remove the override on "${entry.permission.label}"? This reverts to the role default.`)) return;
    setError(null);
    try {
      await api.delete(`/permissions/employees/${employeeId}/overrides/${entry.permission.key}`);
      flashSuccess(`Reverted ${entry.permission.label} to the role default.`);
      load(employeeId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove the override"));
    }
  }

  async function handleReset() {
    if (!employeeId || !summary) return;
    const overrideCount = summary.effective.filter((e) => e.override).length;
    if (overrideCount === 0) return;
    if (!window.confirm(`Reset ${summary.user.name} to role defaults? This removes all ${overrideCount} override(s).`)) return;
    setError(null);
    try {
      const res = await api.post(`/permissions/employees/${employeeId}/reset`);
      flashSuccess(`Removed ${res.data.removed} override(s).`);
      load(employeeId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to reset"));
    }
  }

  /** Case Section Access (2026-08-17) — a checkbox click either reverts an
   * existing override back to the role default (handleRemove already confirms),
   * or opens the same reason dialog Grant/Revoke use, in whichever direction the
   * click implies. */
  function handleSectionToggle(entry: EffectiveEntry) {
    if (entry.override) {
      handleRemove(entry);
    } else {
      setDialog({ entry, effect: entry.granted ? "REVOKE" : "GRANT" });
    }
  }

  const overrideCount = summary?.effective.filter((e) => e.override).length ?? 0;

  return (
    <div>
      <div className="card">
        <EmployeeSearch onSelect={selectEmployee} />
      </div>

      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}

      {employeeId && !summary && !error && <p>Loading…</p>}

      {summary && (
        <>
          <EmployeeHeader user={summary.user} />
          <CaseSectionAccessCard summary={summary} onToggle={handleSectionToggle} />
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="muted">
              {overrideCount} individual override{overrideCount === 1 ? "" : "s"}
            </span>
            <button className="secondary" onClick={handleReset} disabled={overrideCount === 0}>
              Reset to Role Defaults
            </button>
          </div>
          <EffectivePermissionsTable
            entries={summary.effective.filter((e) => !CASE_SECTION_KEYS.has(e.permission.key))}
            employeeRole={summary.user.role}
            showActions
            onGrant={(entry) => setDialog({ entry, effect: "GRANT" })}
            onRevoke={(entry) => setDialog({ entry, effect: "REVOKE" })}
            onRemove={handleRemove}
          />
        </>
      )}

      {!employeeId && (
        <div className="card">
          <p className="muted">Search for an employee above to view and manage their permissions.</p>
        </div>
      )}

      {dialog && (
        <OverrideReasonDialog
          entry={dialog.entry}
          effect={dialog.effect}
          onCancel={() => setDialog(null)}
          onConfirm={handleGrantOrRevoke}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Permission Summary (read-only)                                           */
/* ------------------------------------------------------------------------ */

function PermissionSummaryTab() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setSummary(null);
    setError(null);
    api
      .get(`/permissions/employees/${id}`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(getErrorMessage(err, "Failed to load employee")));
  }

  return (
    <div>
      <div className="card">
        <EmployeeSearch onSelect={selectEmployee} />
      </div>
      {error && <p className="error-text">{error}</p>}
      {employeeId && !summary && !error && <p>Loading…</p>}
      {summary && (
        <>
          <EmployeeHeader user={summary.user} />
          <EffectivePermissionsTable entries={summary.effective} employeeRole={summary.user.role} showActions={false} />
        </>
      )}
      {!employeeId && (
        <div className="card">
          <p className="muted">Search for an employee above to view their full permission summary.</p>
        </div>
      )}
    </div>
  );
}
