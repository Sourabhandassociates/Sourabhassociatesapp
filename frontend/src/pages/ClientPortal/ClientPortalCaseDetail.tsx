import { AppLoader } from "../../components/AppLoader";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";

interface CaseDetailData {
  id: string;
  matterNumber: string;
  bundleNumber: string | null;
  title: string | null;
  caseTitle: string | null;
  practiceArea: string | null;
  status: string;
  stage: string | null;
  caseType: string | null;
  description: string | null;
  oppositeCounsel: string | null;
  oppositeParty: string | null;
  filingDate: string | null;
  courtName: string | null;
  courtNumber: string | null;
  courtCaseNumber: string | null;
  jurisdiction: string | null;
  department: string | null;
  nextHearingDate: string | null;
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
  nextHearingDate: string | null;
  case: {
    matterNumber: string;
    bundleNumber: string | null;
    title: string | null;
    caseType: string | null;
    courtCaseNumber: string | null;
    courtNumber: string | null;
    courtName: string | null;
    stage: string | null;
    status: string;
    nextHearingDate: string | null;
  };
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
    if (!id) {
      setError("Case ID is missing.");
      return;
    }

    let cancelled = false;

    async function loadCasePortalData() {
      setError(null);

      try {
        const profileResponse = await api.get<{
          permissions: {
            cases: boolean;
            hearingHistory: boolean;
            documents: boolean;
          };
        }>("/client-portal/me");

        if (cancelled) return;

        if (!profileResponse.data.permissions.cases) {
          setError("You do not have permission to view this case.");
          return;
        }

        const caseResponse = await api.get<CaseDetailData>(
          `/client-portal/cases/${id}`
        );

        if (cancelled) return;
        setCaseData(caseResponse.data);

        if (profileResponse.data.permissions.hearingHistory) {
          try {
            const hearingResponse = await api.get<HearingRow[]>(
              "/client-portal/hearings",
              { params: { caseId: id } }
            );
            if (!cancelled) setHearings(hearingResponse.data);
          } catch {
            if (!cancelled) setHearings([]);
          }
        } else if (!cancelled) {
          setHearings(null);
        }

        if (profileResponse.data.permissions.documents) {
          try {
            const documentResponse = await api.get<DocumentRow[]>(
              "/client-portal/documents",
              { params: { caseId: id } }
            );
            if (!cancelled) setDocuments(documentResponse.data);
          } catch {
            if (!cancelled) setDocuments([]);
          }
        } else if (!cancelled) {
          setDocuments(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load this case"));
        }
      }
    }

    loadCasePortalData();

    return () => {
      cancelled = true;
    };
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
  if (!caseData) return <AppLoader />;

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
            <strong>Bundel Number:</strong>{caseData.bundleNumber ?? "_"}
          </p>
          <p>
            <strong>Court Case Number:</strong> {caseData.courtCaseNumber ?? "—"}
          </p>

          <p>
            <strong>Case Title:</strong> {caseData.title ?? "—"}
          </p>
          <p>
            <strong>Court Name:</strong> {caseData.courtName ?? "—"}
          </p>
          <p>
            <strong>Court Number:</strong> {caseData.courtNumber ?? "—"}
          </p>
          <p>
            <strong>Stage:</strong> {caseData.stage ?? "—"}
          </p>
          <p>
            <strong>Practice Area:</strong> {caseData.practiceArea ?? "—"}
          </p>

          <p>
            <strong>Case Type:</strong> {caseData.caseType ?? "—"}
          </p>
          <p>
            <strong>Jurisdiction:</strong> {caseData.jurisdiction ?? "—"}
          </p>

          <p>
            <strong>Status:</strong> <span className={`badge status-${caseData.status}`}>{caseData.status}</span>
          </p>

          {/* <p>
            <strong>Next Hearing:</strong> <span className={`badge status-${caseData.nextHearingDate}`}>{caseData.nextHearingDate}</span>
          </p> */}

          <p>
            <strong>Next Hearing:</strong>{" "}
            {caseData.nextHearingDate
              ? new Date(caseData.nextHearingDate).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
              : "Not Scheduled"}
          </p>







          {/* <p>
            <strong>Department:</strong> {caseData.department ?? "—"}
          </p>
          <p>
            <strong>Opposite Party:</strong> {caseData.oppositeParty ?? "—"}
          </p>
          <p>
            <strong>Opposite Counsel:</strong> {caseData.oppositeCounsel ?? "—"}
          </p>
          <p>
            <strong>Description:</strong> {caseData.description ?? "—"}
          </p> */}

          <Link to="/client-portal" >Back </Link>
        </div>

        {/* {hearings !== null && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Hearing History</h3>
            {hearings.length === 0 && <p className="muted">No hearings recorded yet.</p>}
            {hearings.map((h) => (
              <div key={h.id} style={{ padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
                <p><strong>Hearing Date:</strong> {new Date(h.hearingDate).toLocaleDateString("en-IN")}</p>
                <p><strong>Bundle Number:</strong> {h.case.bundleNumber ?? "—"}</p>
                <p><strong>Case Title:</strong> {h.case.title ?? "—"}</p>
                <p><strong>Case Type:</strong> {h.case.caseType ?? "—"}</p>
                <p><strong>Court Case Number:</strong> {h.case.courtCaseNumber ?? "—"}</p>
                <p><strong>Court Number:</strong> {h.case.courtNumber ?? "—"}</p>
                <p><strong>Stage:</strong> {h.case.stage ?? "—"}</p>
                <p><strong>Court:</strong> {h.courtName ?? h.case.courtName ?? "—"}</p>
                <p><strong>Court Hall:</strong> {h.courtHall ?? "—"}</p>
                <p><strong>Judge:</strong> {h.judgeName ?? "—"}</p>
                <p><strong>Purpose:</strong> {h.purpose ?? "—"}</p>
                <p><strong>Outcome:</strong> {h.outcomeNotes ?? "—"}</p>
                <p><strong>Status:</strong> <span className={`badge status-${h.status}`}>{h.status}</span></p>
              </div>
            ))}
          </div>
        )} */}


        {hearings !== null && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Hearing History</h3>

            {hearings.length === 0 && (
              <p className="muted">No hearings recorded yet.</p>
            )}

            {hearings.length > 0 && (
              <div
                style={{
                  width: "100%",
                  overflowX: "auto",
                  borderRadius: 12,
                  marginTop: 12,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    minWidth: 1500,
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    backgroundColor: "#ffffff",
                    borderRadius: 12,
                    overflow: "hidden",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: "#f1f3fa" }}>
                      {[

                        "BUNDLE NUMBER",
                        "CASE TYPE",
                        "COURT CASE NUMBER",
                        "COURT NUMBER",




                        "COURT COMPLEX",
                        "CASE TITLE",


                        "STATUS",
                      ].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            padding: "14px 16px",
                            color: "#64748b",
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {hearings.map((h) => (
                      <tr key={h.id}>
                        {/* <td
                          style={{
                            padding: "15px 16px",
                            color: "#475569",
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          {new Date(h.hearingDate).toLocaleDateString("en-IN")}
                        </td> */}

                        <td
                          style={{
                            padding: "15px 16px",
                            color: "#475569",
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          {h.case.bundleNumber ?? "—"}
                        </td>


                        <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                          {h.case.caseType ?? "—"}
                        </td>

                        <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                          {h.case.courtCaseNumber ?? "—"}
                        </td>


                        <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                          {h.case.courtNumber ?? "—"}
                        </td>




                        <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                          {h.courtName ?? h.case.courtName ?? "—"}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            color: "#2563eb",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          {h.case.title ?? "—"}
                        </td>



                        <td
                          style={{
                            padding: "15px 16px",
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          <span className={`badge status-${h.status}`}>
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
