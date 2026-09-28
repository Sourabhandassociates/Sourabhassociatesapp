import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";

interface ClientProfile {
  id: string;
  clientId: string;
  name: string;
  permissions: { cases: boolean; hearingHistory: boolean; documents: boolean };
}
interface CaseSummary {
  id: string;
  matterNumber: string;
  title: string | null;
  status: string;
  stage: string | null;
  filingDate: string | null;
  courtName: string | null;
}
interface HearingSummary {
  id: string;
  hearingDate: string;
  courtName: string | null;
  purpose: string | null;
  status: string;
  case: { matterNumber: string; title: string | null };
}
interface DocumentSummary {
  id: string;
  title: string;
  category: string;
  case: { matterNumber: string; title: string | null };
  versions: { versionNumber: number; fileName: string }[];
}

/** Client Portal Permissions (2026-08-14). Sections shown are driven entirely by
 * `/client-portal/me`'s `permissions` object, re-fetched on every page load rather
 * than cached — a Managing Partner toggle change is reflected the next time this
 * page (re)loads, satisfying "changes take effect immediately" without polling. */
export default function ClientPortalDashboard() {
  const { auth, logout } = useAuth();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [hearings, setHearings] = useState<HearingSummary[] | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);

  useEffect(() => {
    api.get<ClientProfile>("/client-portal/me").then((res) => {
      setProfile(res.data);
      if (res.data.permissions.cases) {
        api.get("/client-portal/cases").then((r) => setCases(r.data.map((row: { case: CaseSummary }) => row.case)));
      }
      if (res.data.permissions.hearingHistory) {
        api.get<HearingSummary[]>("/client-portal/hearings").then((r) => setHearings(r.data));
      }
      if (res.data.permissions.documents) {
        api.get<DocumentSummary[]>("/client-portal/documents").then((r) => setDocuments(r.data));
      }
    });
  }, []);

  async function handleDownload(documentId: string, fileName: string) {
    await downloadFile(`/client-portal/documents/${documentId}/download`, {}, fileName);
  }

  if (!profile) return <p>Loading…</p>;

  return (
    <div className="login-page">
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div className="page-header" style={{ color: "#fff" }}>
          <h1>Welcome, {auth?.name}</h1>
          <button className="secondary" onClick={() => logout()}>
            Log out
          </button>
        </div>

        {profile.permissions.cases && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>My Cases</h3>
            {cases === null && <p className="muted">Loading…</p>}
            {cases?.length === 0 && <p className="muted">No matters linked to your account yet.</p>}
            {cases?.map((c) => (
              <p key={c.id}>
                <Link to={`/client-portal/cases/${c.id}`}>{c.matterNumber}</Link>
                {c.title ? ` — ${c.title}` : ""} <span className={`badge status-${c.status}`}>{c.status}</span>
              </p>
            ))}
          </div>
        )}

        {profile.permissions.hearingHistory && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Hearing History</h3>
            {hearings === null && <p className="muted">Loading…</p>}
            {hearings?.length === 0 && <p className="muted">No hearings recorded yet.</p>}
            {hearings?.map((h) => (
              <p key={h.id}>
                {new Date(h.hearingDate).toLocaleDateString()} — {h.case.matterNumber}
                {h.purpose ? ` (${h.purpose})` : ""} <span className={`badge status-${h.status}`}>{h.status}</span>
              </p>
            ))}
          </div>
        )}

        {profile.permissions.documents && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Documents</h3>
            {documents === null && <p className="muted">Loading…</p>}
            {documents?.length === 0 && <p className="muted">No documents have been shared yet.</p>}
            {documents?.map((d) => (
              <p key={d.id}>
                {d.title} <span className="muted">({d.category} — {d.case.matterNumber})</span>{" "}
                <button className="secondary" onClick={() => handleDownload(d.id, d.versions[0]?.fileName ?? d.title)}>
                  Download
                </button>
              </p>
            ))}
          </div>
        )}

        {!profile.permissions.cases && !profile.permissions.hearingHistory && !profile.permissions.documents && (
          <div className="card">
            <p className="muted">Nothing is currently enabled for your account. Contact your firm for access.</p>
          </div>
        )}
      </div>
    </div>
  );
}
