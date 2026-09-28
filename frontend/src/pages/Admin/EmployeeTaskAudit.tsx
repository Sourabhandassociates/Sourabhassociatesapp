import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface StaffMember {
  id: string;
  name: string;
  role: string;
}
interface AuditTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  case: { id: string; matterNumber: string; title: string };
}
interface AuditStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  onTimeRate: number;
  totalActiveCases: number;
}
interface CurrentCase {
  id: string;
  matterNumber: string;
  /** New Case form simplification (2026-08-11) — title is now optional. */
  title: string | null;
  status: string;
}

/** SRD Step 1 revision (item 3) — Employee Task Audit: Managing Partner selects any
 * employee and reviews their assigned/pending/completed/overdue tasks with date-range
 * filtering, search, and productivity stats. */
export default function EmployeeTaskAudit() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<AuditTask[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [currentCases, setCurrentCases] = useState<CurrentCase[]>([]);

  useEffect(() => {
    api.get("/auth/staff-directory").then((res) => setStaff(res.data));
  }, []);

  function load(e?: FormEvent) {
    e?.preventDefault();
    if (!employeeId) return;
    api
      .get(`/tasks/audit/${employeeId}`, {
        params: {
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          search: search || undefined,
        },
      })
      .then((res) => {
        setTasks(res.data.tasks);
        setStats(res.data.stats);
        setCurrentCases(res.data.currentCases);
      });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Employee Task Audit</h1>
      </div>

      <div className="card">
        <form onSubmit={load}>
          <div className="form-grid">
            <div>
              <label htmlFor="employee">Employee</label>
              <select
                id="employee"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                }}
                required
              >
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role.replaceAll("_", " ")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="search">Search (task/matter title)</label>
              <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div>
              <label htmlFor="startDate">Due date from</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="endDate">Due date to</label>
              <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <button className="primary" type="submit">
            View Audit
          </button>
        </form>
      </div>

      {stats && (
        <div className="card">
          <h3>Productivity Statistics</h3>
          <div className="dashboard-grid">
            <div className="stat-tile">
              <div className="value">{stats.totalActiveCases}</div>
              <div className="label">Active Cases</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.total}</div>
              <div className="label">Total Tasks</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.pending}</div>
              <div className="label">Pending Tasks</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.overdue}</div>
              <div className="label">Overdue Tasks</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.completed}</div>
              <div className="label">Completed Tasks</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.completionRate}%</div>
              <div className="label">Completion Rate</div>
            </div>
            <div className="stat-tile">
              <div className="value">{stats.onTimeRate}%</div>
              <div className="label">On-Time Completion Rate</div>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="card">
          <h3>Current Case List</h3>
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Matter</th>
                <th>Cause Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentCases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/cases/${c.id}`}>{c.matterNumber}</Link>
                  </td>
                  <td>{c.title ?? "—"}</td>
                  <td>
                    <span className={`badge status-${c.status}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
              {currentCases.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No current cases.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {stats && (
        <div className="card">
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Matter</th>
                <th>Due Date</th>
                <th>Completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>
                    <Link to={`/cases/${t.case.id}`}>{t.case.matterNumber}</Link>
                  </td>
                  <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                  <td>{t.completedAt ? new Date(t.completedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    <span className="badge">{t.isOverdue ? "OVERDUE" : t.status.replaceAll("_", " ")}</span>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No tasks match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
