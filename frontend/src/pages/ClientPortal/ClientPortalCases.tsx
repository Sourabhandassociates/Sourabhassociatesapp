import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";

interface CaseRow {
  partyRole: string;
  case: {
    id: string;
    matterNumber: string;
    title: string | null;
    status: string;
    stage: string | null;
    filingDate: string | null;
    courtName: string | null;
  };
}

/** Client Portal Permissions (2026-08-14) — read-only, no forms. If
 * portalCasesEnabled is off, the backend 403s and this page shows an inline
 * message rather than a broken table. */
export default function ClientPortalCases() {
  const { logout } = useAuth();
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CaseRow[]>("/client-portal/cases")
      .then((res) => setRows(res.data))
      .catch((err) => setError(getErrorMessage(err, "Unable to load your cases")));
  }, []);

  return (
    <div className="login-page">
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div className="page-header" style={{ color: "#fff" }}>
          <h1>My Cases</h1>
          <div style={{ display: "flex", gap: 12 }}>
            <Link to="/client-portal">Back to Dashboard</Link>
            <button className="secondary" onClick={() => logout()}>
              Log out
            </button>
          </div>
        </div>

        <div className="card">
          {error && <p className="error-text">{error}</p>}
          {!error && rows === null && <p className="muted">Loading…</p>}
          {!error && rows?.length === 0 && <p className="muted">No matters linked to your account yet.</p>}
          {rows?.map(({ case: c, partyRole }) => (
            <p key={c.id}>
              <Link to={`/client-portal/cases/${c.id}`}>{c.matterNumber}</Link>
              {c.title ? ` — ${c.title}` : ""} <span className={`badge status-${c.status}`}>{c.status}</span>{" "}
              <span className="muted">({partyRole})</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
