import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";

interface SessionRow {
  id: string;
  deviceInfo: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
  revokedReason: string | null;
}
interface StaffMember {
  id: string;
  name: string;
  role: string;
}

/** Milestone 4 (Version 1.0 completion, SRD Section 9.4 — session management).
 * Every staff member can view/revoke their own sessions; a Managing Partner
 * (SESSIONS.VIEW_ANY) can additionally look up any user's sessions and force-logout
 * all of their devices at once. */
export default function Sessions() {
  const { auth } = useAuth();
  const [mySessions, setMySessions] = useState<SessionRow[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [otherSessions, setOtherSessions] = useState<SessionRow[] | null>(null);

  const loadMine = useCallback(() => {
    api.get("/auth/sessions/me").then((res) => setMySessions(res.data));
  }, []);
  useEffect(() => loadMine(), [loadMine]);

  const isManagingPartner = auth?.role === "MANAGING_PARTNER";
  useEffect(() => {
    if (isManagingPartner) {
      api.get("/auth/staff-directory").then((res) => setStaff(res.data.filter((s: StaffMember) => s.id !== auth?.id)));
    }
  }, [isManagingPartner, auth?.id]);

  async function revokeOwn(sessionId: string) {
    await api.post(`/auth/sessions/${sessionId}/revoke`);
    loadMine();
  }

  function loadOther(userId: string) {
    setSelectedUserId(userId);
    if (!userId) return setOtherSessions(null);
    api.get(`/auth/sessions/${userId}`).then((res) => setOtherSessions(res.data));
  }

  async function forceLogout(userId: string) {
    if (!window.confirm("Force logout this user from every device? They will need to sign in again.")) return;
    await api.post(`/auth/sessions/${userId}/force-logout`);
    loadOther(userId);
  }

  function renderTable(rows: SessionRow[], onRevoke?: (id: string) => void) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>Started</th>
              <th>Last Active</th>
              {onRevoke && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.deviceInfo}</td>
                <td>
                  <span className="badge">{s.status}{s.revokedReason ? ` — ${s.revokedReason.replaceAll("-", " ")}` : ""}</span>
                </td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{new Date(s.lastActiveAt).toLocaleString()}</td>
                {onRevoke && (
                  <td>
                    {s.status === "ACTIVE" && <button onClick={() => onRevoke(s.id)}>Revoke</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={onRevoke ? 5 : 4} className="muted">
                  No sessions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Sessions</h1>
      </div>

      <div className="card">
        <h3>My Sessions</h3>
        {renderTable(mySessions, revokeOwn)}
      </div>

      {isManagingPartner && (
        <div className="card">
          <h3>View Any User's Sessions</h3>
          <div style={{ maxWidth: 320, marginBottom: 16 }}>
            <label htmlFor="userSessionsSelect">Staff Member</label>
            <select id="userSessionsSelect" value={selectedUserId} onChange={(e) => loadOther(e.target.value)}>
              <option value="">Select…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role.replaceAll("_", " ")})
                </option>
              ))}
            </select>
          </div>
          {otherSessions && (
            <>
              {renderTable(otherSessions)}
              {otherSessions.some((s) => s.status === "ACTIVE") && (
                <button style={{ marginTop: 12 }} onClick={() => forceLogout(selectedUserId)}>
                  Force Logout (all devices)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
