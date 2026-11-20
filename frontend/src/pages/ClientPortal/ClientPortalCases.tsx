import { AppLoader } from "../../components/AppLoader";

import { useEffect, useState } from "react";
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
  caseType: string | null;
  title: string | null;
  status: string;
  stage: string | null;
  filingDate: string | null;
  courtName: string | null;
  courtNumber: string | null;
  courtCaseNumber: string | null;
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

/** Client Portal Dashboard */
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
        api
          .get("/client-portal/cases")
          .then((r) =>
            setCases(
              r.data.map((row: { case: CaseSummary }) => row.case)
            )
          );
      }

      if (res.data.permissions.hearingHistory) {
        api
          .get<HearingSummary[]>("/client-portal/hearings")
          .then((r) => setHearings(r.data));
      }

      if (res.data.permissions.documents) {
        api
          .get<DocumentSummary[]>("/client-portal/documents")
          .then((r) => setDocuments(r.data));
      }
    });
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

  if (!profile) {
    return <AppLoader />;
  }

  return (
    <div className="login-page min-h-screen">
      <div className="w-full max-w-5xl mx-auto px-4 py-6">

        {/* Page Header */}
        <div
          className="page-header flex items-center justify-between flex-wrap gap-4 mb-6"
          style={{ color: "#fff" }}
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
          <div className="card mb-6">

            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <h3 className="text-xl font-semibold">
                My Cases
              </h3>

              <Link
                to="/client-portal/cases"
                className="font-semibold text-blue-700"
              >
                View All Cases →
              </Link>
            </div>

            {/* Loading */}
            {cases === null && (
              <AppLoader />
            )}

            {/* Empty State */}
            {cases?.length === 0 && (
              <p className="muted">
                No matters linked to your account yet.
              </p>
            )}

            {/* Case Cards */}
            <div className="space-y-5">
              {cases?.map((c) => (
                <div
                  key={c.id}
                  className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm"
                >

                  {/* Case Header */}
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-5 pb-4 border-b border-gray-200">

                    <div>
                      <p className="text-xs text-gray-500 mb-1">
                        Client Register Number
                      </p>

                      <Link
                        to={`/client-portal/cases/${c.id}`}
                        className="text-lg font-semibold text-blue-700 hover:underline"
                      >
                        {c.matterNumber}
                      </Link>
                    </div>

                    <span className={`badge status-${c.status}`}>
                      {c.status}
                    </span>

                  </div>

                  {/* Case Information - Two Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Case Type */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">Case Type</p>
                      <p className="font-semibold text-gray-900">{c.caseType || "Not available"}</p>
                    </div>

                    {/* Case Title */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Case Title
                      </p>

                      <p className="font-semibold text-gray-900 break-words">
                        {c.title || "Not available"}
                      </p>
                    </div>

                    {/* Court Name */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Court Name
                      </p>

                      <p className="font-semibold text-gray-900">
                        {c.courtName || "Not available"}
                      </p>
                    </div>

                    {/* Court Number */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Court Number
                      </p>

                      <p className="font-semibold text-gray-900">
                        {c.courtNumber || "Not available"}
                      </p>
                    </div>

                    {/* Court Case Number */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Court Case Number
                      </p>

                      <p className="font-semibold text-gray-900 break-words">
                        {c.courtCaseNumber || "Not available"}
                      </p>
                    </div>

                    {/* Case Stage */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Case Stage
                      </p>

                      <p className="font-semibold text-gray-900">
                        {c.stage || "Not available"}
                      </p>
                    </div>

                    {/* Filing Date */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500 mb-2">
                        Filing Date
                      </p>

                      <p className="font-semibold text-gray-900">
                        {c.filingDate
                          ? new Date(c.filingDate).toLocaleDateString()
                          : "Not available"}
                      </p>
                    </div>

                  </div>

                  {/* View Case Details */}
                  <div className="mt-5 pt-4 border-t border-gray-200">
                    <Link
                      to={`/client-portal/cases/${c.id}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      View Case Details →
                    </Link>
                  </div>

                </div>
              ))}
            </div>

          </div>
        )}

        {/* Client-only Hearing Calendar */}
        {profile.permissions.hearingHistory && (
          <ClientPortalHearingCalendar hearings={hearings} />
        )}

        {/* Documents */}
        {profile.permissions.documents && (
          <div className="card mb-6">

            <h3 className="text-xl font-semibold mb-5">
              Documents
            </h3>

            {documents === null && (
              <AppLoader />
            )}

            {documents?.length === 0 && (
              <p className="muted">
                No documents have been shared yet.
              </p>
            )}

            {documents?.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between flex-wrap gap-3 border-b border-gray-200 py-3"
              >
                <div>
                  <p className="font-semibold">
                    {d.title}
                  </p>

                  <p className="muted text-sm">
                    {d.category} — {d.case.matterNumber}
                  </p>
                </div>

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
              </div>
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
