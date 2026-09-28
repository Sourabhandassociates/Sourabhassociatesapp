import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";

interface CaseDetailData {
  id: string;
  matterNumber: string;
  title: string | null;
  status: string;
  stage: string | null;
  caseType: string | null;
  filingDate: string | null;
  courtName: string | null;
  courtNumber: string | null;
  jurisdiction: string | null;
  department: string | null;
}
interface HearingRow {
  id: string;
  hearingDate: string;
  courtName: string | null;
  courtHall: string | null;
  judgeName: string | null;
  purpose: string | null;
  outcomeNotes: string | null;
  status: string;
}
interface DocumentRow {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  versions: { versionNumber: number; fileName: string }[];
}

/** Client Portal Permissions (2026-08-14). Hearing History and Documents sections
 * are only fetched (and only rendered) when the client's own /me response says
 * that permission is currently on — re-checked on every load of this page, not
 * cached from the Dashboard. */
export default function ClientPortalCaseDetail() {
  const { id } = useParams();
  const { logout } = useAuth();
  const [caseData, setCaseData] = useState<CaseDetailData | null>(null);
  const [hearings, setHearings] = useState<HearingRow[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<CaseDetailData>(`/client-portal/cases/${id}`)
      .then((res) => setCaseData(res.data))
      .catch((err) => setError(getErrorMessage(err, "Unable to load this case")));

    api.get<{ permissions: { hearingHistory: boolean; documents: boolean } }>("/client-portal/me").then((res) => {
      if (res.data.permissions.hearingHistory) {
        api.get<HearingRow[]>("/client-portal/hearings", { params: { caseId: id } }).then((r) => setHearings(r.data));
      }
      if (res.data.permissions.documents) {
        api.get<DocumentRow[]>("/client-portal/documents", { params: { caseId: id } }).then((r) => setDocuments(r.data));
      }
    });
  }, [id]);

  async function handleDownload(documentId: string, fileName: string) {
    await downloadFile(`/client-portal/documents/${documentId}/download`, {}, fileName);
  }

  if (error) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="error-text">{error}</p>
          <Link to="/client-portal">Back to Dashboard</Link>
        </div>
      </div>
    );
  }
  if (!caseData) return <p>Loading…</p>;

  return (
    <div className="login-page">
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div className="page-header" style={{ color: "#fff" }}>
          <h1>{caseData.matterNumber}</h1>
          <div style={{ display: "flex", gap: 12 }}>
            <Link to="/client-portal">Back to Dashboard</Link>
            <button className="secondary" onClick={() => logout()}>
              Log out
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Case Overview</h3>
          <p>
            <strong>Title:</strong> {caseData.title ?? "—"}
          </p>
          <p>
            <strong>Status:</strong> <span className={`badge status-${caseData.status}`}>{caseData.status}</span>
          </p>
          <p>
            <strong>Stage:</strong> {caseData.stage ?? "—"}
          </p>
          <p>
            <strong>Case Type:</strong> {caseData.caseType ?? "—"}
          </p>
          <p>
            <strong>Filing Date:</strong> {caseData.filingDate ? new Date(caseData.filingDate).toLocaleDateString() : "—"}
          </p>
          <p>
            <strong>Court:</strong> {caseData.courtName ?? "—"} {caseData.courtNumber ? `(No. ${caseData.courtNumber})` : ""}
          </p>
          <p>
            <strong>Jurisdiction:</strong> {caseData.jurisdiction ?? "—"}
          </p>
        </div>

        {hearings !== null && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Hearing History</h3>
            {hearings.length === 0 && <p className="muted">No hearings recorded yet.</p>}
            {hearings.map((h) => (
              <p key={h.id}>
                {new Date(h.hearingDate).toLocaleDateString()}
                {h.courtName ? ` — ${h.courtName}` : ""}
                {h.purpose ? ` (${h.purpose})` : ""} <span className={`badge status-${h.status}`}>{h.status}</span>
              </p>
            ))}
          </div>
        )}

        {documents !== null && (
          <div className="card">
            <h3>Documents</h3>
            {documents.length === 0 && <p className="muted">No documents have been shared yet.</p>}
            {documents.map((d) => (
              <p key={d.id}>
                {d.title} <span className="muted">({d.category})</span>{" "}
                <button
                  className="secondary"
                  onClick={() => handleDownload(d.id, d.versions[0]?.fileName ?? d.title)}
                >
                  Download
                </button>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
