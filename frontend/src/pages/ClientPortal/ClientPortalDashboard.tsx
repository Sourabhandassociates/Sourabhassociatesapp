import { AppLoader } from "../../components/AppLoader";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { downloadFile } from "../../utils/downloadFile";
import { getErrorMessage } from "../../api/errorMessage";
import ClientPortalHearingCalendar from "./ClientPortalHearingCalendar";

interface ClientProfile {
  id: string;
  clientId: string;
  name: string;
    newname: string | null;
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
    courtCaseNumber: string | null;
    courtNumber: string | null;
    courtName: string | null;
    stage: string | null;
    status: string;
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
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const res = await api.get<ClientProfile>("/client-portal/me");

        if (cancelled) return;

        setProfile(res.data);
        setProfileName(res.data.name);

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

  async function handleProfileUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setProfileError("New password and confirmation do not match.");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setProfileError("New password must be at least 8 characters.");
      return;
    }

    setProfileSaving(true);
    try {
      const response = await api.patch("/client-portal/me/profile", {
        name: profileName,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      setProfile((previous) => previous ? { ...previous, name: response.data.name } : previous);
      setProfileName(response.data.name);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (response.data.passwordChanged) {
        setProfileMessage("Your details were updated. Please sign in again with your new password.");
        window.setTimeout(() => logout(), 1600);
      } else {
        setProfileMessage("Your profile name has been updated successfully.");
      }
    } catch (err) {
      setProfileError(getErrorMessage(err, "Unable to update your profile."));
    } finally {
      setProfileSaving(false);
    }
  }

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
          <h1>Welcome, {profile.newname || profile.name || auth?.name}</h1>

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
                        Bundle Number
                      </th>
                      {/* <th style={headerStyle}>
                      REGISTER NUMBER
                      </th> */}

                      <th style={headerStyle}>
                        CASE NO
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
                        Court Name
                      </th>

                      <th style={headerStyle}>
                        COURT NO.
                      </th>

                      <th style={headerStyle}>
                        CASE TYPE
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

                        <td style={cellStyle}>
                          {c.bundleNumber || "_"}
                        </td>


                        {/* Case Register Number */}
                        {/* <td style={cellStyle}>
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
                        </td> */}


                    

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
                              color: "#005eff",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {c.title || "—"}
                          </Link>
                        </td>

                        <td style={cellStyle}>
                          {c.courtName || "_"}
                        </td>



                        {/* Court Number */}
                        <td style={cellStyle}>
                          {c.courtNumber || "—"}
                        </td>


                        {/* Case Type */}
                        <td style={cellStyle}>
                          {c.caseType || "—"}
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

        {/* Client self-service profile settings */}
        <div className="card" style={{ marginBottom: "24px", padding: "20px" }}>
          <h3 style={{ marginTop: 0 }}>My Profile & Login Details</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Update your display name or change your Client Portal password.
          </p>
          <form onSubmit={handleProfileUpdate} style={{ maxWidth: "520px" }}>
            <label htmlFor="portal-profile-name">Your Name</label>
            <input
              id="portal-profile-name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
              maxLength={120}
            />

            <div style={{ marginTop: "16px" }}>
              <label htmlFor="portal-current-password">Current Password (required to change password)</label>
              <div style={{ position: "relative" }}>
                <input
                  id="portal-current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((visible) => !visible)}
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", cursor: "pointer", padding: "4px", color: "#64748b", display: "flex", alignItems: "center" }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showCurrentPassword ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9 7-.2 1.1-1.1 2.5-2.5 3.7" /><path d="M6.2 6.2C3.9 7.7 2.3 10 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label htmlFor="portal-new-password">New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="portal-new-password"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank if you only want to change your name"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", cursor: "pointer", padding: "4px", color: "#64748b", display: "flex", alignItems: "center" }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showNewPassword ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9 7-.2 1.1-1.1 2.5-2.5 3.7" /><path d="M6.2 6.2C3.9 7.7 2.3 10 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label htmlFor="portal-confirm-password">Confirm New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="portal-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", cursor: "pointer", padding: "4px", color: "#64748b", display: "flex", alignItems: "center" }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showConfirmPassword ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9 7-.2 1.1-1.1 2.5-2.5 3.7" /><path d="M6.2 6.2C3.9 7.7 2.3 10 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
            </div>

            {profileError && <p className="error-text" role="alert">{profileError}</p>}
            {profileMessage && <p style={{ color: "#16803c" }} role="status">{profileMessage}</p>}

            <div className="form-actions" style={{ marginTop: "18px" }}>
              <button className="primary" type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>


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
