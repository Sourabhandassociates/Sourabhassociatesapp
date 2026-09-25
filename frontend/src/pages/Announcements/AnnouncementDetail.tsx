import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";

/** Announcements simplification pass (2026-08-13) — priority/audience/start-expiry
 * date fields are no longer displayed here (every announcement is unconditionally
 * EVERYONE/NORMAL going forward), but the API response still carries them for
 * historical announcements created before this pass; omitted from this type since
 * nothing on this screen reads them anymore. */
interface AnnouncementDetailData {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  createdBy: { id: string; name: string };
  isReadByMe: boolean | null;
  readAtByMe: string | null;
}

interface ReadTrackingUser {
  id: string;
  name: string;
  role: string;
}
interface ReadTracking {
  totalRecipients: number;
  readCount: number;
  unreadCount: number;
  readUsers: (ReadTrackingUser & { readAt: string })[];
  unreadUsers: ReadTrackingUser[];
}

/** Reached either via a notification click (NotificationBell.tsx) or a direct link
 * from the Dashboard widget. Opening this screen auto-marks the actor's own
 * notification read (requirement: "a notification should remain unread until the
 * user opens the announcement or explicitly marks it as read") — the explicit "Mark
 * as Read" button below is a manual fallback for the same action, not a second
 * mechanism. The Read Tracking section only renders for the Managing Partner, and
 * only because the backend itself refuses the request for anyone else (403) — this
 * is a convenience to skip a doomed request, not the actual access control. */
export default function AnnouncementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [data, setData] = useState<AnnouncementDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<ReadTracking | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get<AnnouncementDetailData>(`/announcements/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        setData(res.data);
        if (res.data.isReadByMe === false) {
          await api.patch(`/announcements/${id}/read`);
          if (!cancelled) {
            setData((prev) => (prev ? { ...prev, isReadByMe: true, readAtByMe: new Date().toISOString() } : prev));
          }
        }
      })
      .catch((err) => setError(getErrorMessage(err, "Announcement not found")));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (auth?.role === "MANAGING_PARTNER" && id) {
      api.get<ReadTracking>(`/announcements/${id}/read-tracking`).then((res) => setTracking(res.data));
    }
  }, [auth?.role, id]);

  async function markReadNow() {
    if (!id) return;
    await api.patch(`/announcements/${id}/read`);
    setData((prev) => (prev ? { ...prev, isReadByMe: true, readAtByMe: new Date().toISOString() } : prev));
  }

  if (error) {
    return (
      <div>
        <p className="error-text">{error}</p>
        <button className="secondary" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </div>
    );
  }
  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{data.title}</h1>
      </div>

      <div className="card announcement-card">
        <p style={{ whiteSpace: "pre-wrap" }}>{data.body}</p>
        <p className="muted" style={{ margin: "12px 0 0" }}>
          Posted By: {data.createdBy.name}
        </p>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Date &amp; Time: {new Date(data.createdAt).toLocaleString()}
        </p>

        {data.isReadByMe !== null && (
          <p style={{ margin: "12px 0 0" }}>
            {data.isReadByMe ? (
              <span className="badge status-ACTIVE">Read{data.readAtByMe ? ` on ${new Date(data.readAtByMe).toLocaleString()}` : ""}</span>
            ) : (
              <button onClick={markReadNow}>Mark as Read</button>
            )}
          </p>
        )}
      </div>

      {auth?.role === "MANAGING_PARTNER" && tracking && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Read Tracking</h3>
          <p>
            <strong>{tracking.totalRecipients}</strong> total recipient{tracking.totalRecipients === 1 ? "" : "s"} —{" "}
            <strong>{tracking.readCount}</strong> read, <strong>{tracking.unreadCount}</strong> unread
          </p>
          <div className="read-tracking-columns">
            <div>
              <h4>Read</h4>
              <ul>
                {tracking.readUsers.map((u) => (
                  <li key={u.id}>
                    {u.name} — {new Date(u.readAt).toLocaleString()}
                  </li>
                ))}
                {tracking.readUsers.length === 0 && <li className="muted">No one yet.</li>}
              </ul>
            </div>
            <div>
              <h4>Unread</h4>
              <ul>
                {tracking.unreadUsers.map((u) => (
                  <li key={u.id}>{u.name}</li>
                ))}
                {tracking.unreadUsers.length === 0 && <li className="muted">Everyone has read it.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <button className="secondary" style={{ marginTop: 16 }} onClick={() => navigate("/dashboard")}>
        Back to Dashboard
      </button>
    </div>
  );
}
