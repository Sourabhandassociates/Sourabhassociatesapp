import { AppLoader } from "../../components/AppLoader";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";
import ClientPortalHearingCalendar from "./ClientPortalHearingCalendar";

interface ClientProfile {
  id: string;
  clientId: string;
  name: string;
  permissions: {
    cases: boolean;
    hearingHistory: boolean;
    documents: boolean;
  };
}

interface CaseSummary {
  id: string;
  matterNumber: string;
  bundleNumber: string | null;
  caseType: string | null;
  courtCaseNumber: string | null;
  title: string | null;
  courtNumber: string | null;
  courtName: string | null;
  status: string;
  stage: string | null;
  filingDate: string | null;
}

interface CaseRow {
  partyRole: string;
  case: CaseSummary;
}

interface HearingSummary {
  id: string;
  hearingDate: string;
  courtName: string | null;
  courtHall: string | null;
  judgeName: string | null;
  purpose: string | null;
  outcomeNotes: string | null;
  status: string;
  case: {
    matterNumber: string;
    bundleNumber: string | null;
    title: string | null;
    caseType: string | null;
  };
}

interface DocumentSummary {
  id: string;
  title: string;
  category: string;
  case: {
    matterNumber: string;
    title: string | null;
  };
  versions: {
    versionNumber: number;
    fileName: string;
  }[];
}

const cellStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #e2e8f0",
  color: "#404652",
  fontSize: "13px",
  verticalAlign: "middle",
};

const headerStyle: CSSProperties = {
  padding: "14px 16px",
  backgroundColor: "#f3f5fb",
  color: "#64748b",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.4px",
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #dce3f5",
};

const statusStyle: CSSProperties = {
  display: "inline-block",
  backgroundColor: "#fff2d5",
  color: "#a66b08",
  padding: "5px 11px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

export default function ClientPortalDashboard() {
  const { auth, logout } = useAuth();

  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [hearings, setHearings] = useState<HearingSummary[] | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);

  const [caseError, setCaseError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const res = await api.get<ClientProfile>("/client-portal/me");

        if (cancelled) return;

        setProfile(res.data);

        if (res.data.permissions.cases) {
          try {
            const caseResponse = await api.get<CaseRow[]>(
              "/client-portal/cases"
            );

            if (!cancelled) {
              setCases(
                caseResponse.data.map((row) => row.case)
              );
            }
          } catch {
            if (!cancelled) {
              setCaseError("Unable to load your cases.");
              setCases([]);
            }
          }
        }

        if (res.data.permissions.hearingHistory) {
          try {
            const hearingResponse =
              await api.get<HearingSummary[]>("/client-portal/hearings");

            if (!cancelled) {
              setHearings(hearingResponse.data);
            }
          } catch {
            if (!cancelled) {
              setHearings([]);
            }
          }
        }

        if (res.data.permissions.documents) {
          try {
            const documentResponse =
              await api.get<DocumentSummary[]>("/client-portal/documents");

            if (!cancelled) {
              setDocuments(documentResponse.data);
            }
          } catch {
            if (!cancelled) {
              setDocuments([]);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setPageError("Unable to load your client portal.");
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDownload(
    documentId: string,
    fileName: string
  ) {
    await downloadFile(
      `/client-portal/documents/${documentId}/download`,
      {},
      fileName
    );
  }

  if (pageError) {
    return (
      <div className="login-page">
        <div className="card">
          <p className="error-text">{pageError}</p>
          <button
            className="secondary"
            onClick={() => logout()}
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <AppLoader />;
  }

  return (
    <div className="login-page" style={{ minHeight: "100vh" }}>
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* Page Header */}
        <div
          className="page-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "15px",
            color: "#ffffff",
            marginBottom: "24px",
          }}
        >
          <h1>Welcome, {auth?.name}</h1>

          <button
            className="secondary"
            onClick={() => logout()}
          >
            Log out
          </button>
        </div>

        {/* My Cases */}
        {profile.permissions.cases && (
          <div
            className="card"
            style={{
              marginBottom: "24px",
              padding: "20px",
              borderRadius: "12px",
            }}
          >
            {/* Section Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "19px",
                  fontWeight: 600,
                  color: "#202938",
                }}
              >
                My Cases
              </h3>

              {/* <Link
                to="/client-portal/cases"
                style={{
                  color: "#315efb",
                  fontWeight: 600,
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                View All Cases →
              </Link> */}
            </div>

            {/* Loading */}
            {cases === null && (
              <AppLoader />
            )}

            {/* Error */}
            {caseError && (
              <p className="error-text">{caseError}</p>
            )}

            {/* Empty State */}
            {!caseError && cases?.length === 0 && (
              <p className="muted">
                No matters linked to your account yet.
              </p>
            )}

            {/* Cases Table */}
            {!caseError && cases && cases.length > 0 && (
              <div
                style={{
                  width: "100%",
                  overflowX: "auto",
                  borderRadius: "8px",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    minWidth: "1000px",
                    borderCollapse: "collapse",
                    tableLayout: "auto",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={headerStyle}>
                        CASE REGISTER NUMBER
                      </th>

                      <th style={headerStyle}>
                        CASE TYPE
                      </th>
                      <th style={headerStyle}>
                        Court Name
                      </th>

                     

                      <th style={headerStyle}>
                        COURT CASE NO.
                      </th>

                      <th
                        style={{
                          ...headerStyle,
                          minWidth: "260px",
                        }}
                      >
                        TITLE
                      </th>

                      <th style={headerStyle}>
                        COURT NO.
                      </th>

                      <th style={headerStyle}>
                        COURT COMPLEX
                      </th>

                      <th style={headerStyle}>
                        STATUS
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {cases.map((c) => (
                      <tr
                        key={c.id}
                        style={{
                          backgroundColor: "#ffffff",
                        }}
                      >
                        {/* Case Register Number */}
                        <td style={cellStyle}>
                          <Link
                            to={`/client-portal/cases/${c.id}`}
                            style={{
                              color: "#315efb",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {c.matterNumber || "—"}
                          </Link>
                        </td>

                        {/* Case Type */}
                        <td style={cellStyle}>
                          {c.caseType || "—"}
                        </td>

                        <td style={cellStyle}>
                          {c.courtName || "_"}
                        </td>
                     

                        {/* Court Case Number */}
                        <td style={cellStyle}>
                          {c.courtCaseNumber || "—"}
                        </td>

                        {/* Title */}
                        <td
                          style={{
                            ...cellStyle,
                            minWidth: "260px",
                          }}
                        >
                          <Link
                            to={`/client-portal/cases/${c.id}`}
                            style={{
                              color: "#30343b",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {c.title || "—"}
                          </Link>
                        </td>

                        {/* Court Number */}
                        <td style={cellStyle}>
                          {c.courtNumber || "—"}
                        </td>

                        {/* Court Complex */}
                        <td style={cellStyle}>
                          {c.courtName || "—"}
                        </td>

                        {/* Status */}
                        <td style={cellStyle}>
                          <span style={statusStyle}>
                            {c.status || "—"}
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

        {/* Client-only Hearing Calendar */}
        {profile.permissions.hearingHistory && (
          <ClientPortalHearingCalendar hearings={hearings} />
        )}

        {/* Documents */}
        {profile.permissions.documents && (
          <div
            className="card"
            style={{ marginBottom: "24px" }}
          >
            <h3>Documents</h3>

            {documents === null && (
              <AppLoader />
            )}

            {documents?.length === 0 && (
              <p className="muted">
                No documents have been shared yet.
              </p>
            )}

            {documents?.map((d) => (
              <p key={d.id}>
                {d.title}

                <span className="muted">
                  {" "}({d.category} — {d.case.matterNumber})
                </span>

                {" "}

                <button
                  className="secondary"
                  onClick={() =>
                    handleDownload(
                      d.id,
                      d.versions[0]?.fileName ?? d.title
                    )
                  }
                >
                  Download
                </button>
              </p>
            ))}
          </div>
        )}

        {/* No Permissions */}
        {!profile.permissions.cases &&
          !profile.permissions.hearingHistory &&
          !profile.permissions.documents && (
            <div className="card">
              <p className="muted">
                Nothing is currently enabled for your account.
                Contact your firm for access.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
