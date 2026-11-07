
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { SearchableSelect } from "../../components/SearchableSelect";

/** New Case form simplification (2026-08-11) — title is now optional. */
interface CaseLink {
  case: {
    id: string;
    matterNumber: string;
    title: string | null;
    status: string;
  };
}

interface ClientDetail {
  id: string;
  clientId: string;
  name: string;
  type: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  cases: CaseLink[];
  portalCasesEnabled: boolean;
  portalHearingHistoryEnabled: boolean;
  portalDocumentsEnabled: boolean;
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const canEdit =
    auth?.role === "MANAGING_PARTNER" ||
    auth?.role === "ASSOCIATE" ||
    auth?.role === "OFFICE_STAFF";

  const canManagePortalAccess = auth?.role === "MANAGING_PARTNER";

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalSaving, setPortalSaving] = useState<string | null>(null);

  const requestId = useRef(0);

  async function load() {
    if (!id) return;

    const currentRequest = ++requestId.current;

    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/clients/${id}`);

      if (currentRequest !== requestId.current) return;

      setClient(res.data);
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      console.error("Failed to load client:", err);
      setError(getErrorMessage(err, "Unable to load client details."));
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();

    return () => {
      requestId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!client) return;

    setName(client.name);
    setType(client.type ?? "");
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setAddress(client.address ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!client) return;

    setError(null);

    try {
      await api.patch(`/clients/${client.id}`, {
        name,
        type,
        email,
        phone,
        address,
      });

      setEditing(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update client"));
    }
  }

  /** Soft Delete & Recycle Bin — never a real delete. */
  async function handleDelete() {
    if (!client) return;

    if (
      !window.confirm(
        `Move client ${client.clientId} — ${client.name} to the Recycle Bin?`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/clients/${client.id}`);
      navigate("/clients");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to move client to Recycle Bin."));
    }
  }

  /** Client Portal Permissions — each toggle takes effect immediately. */
  async function togglePortalPermission(
    key:
      | "portalCasesEnabled"
      | "portalHearingHistoryEnabled"
      | "portalDocumentsEnabled",
    next: boolean
  ) {
    if (!client) return;

    setPortalError(null);
    setPortalSaving(key);

    try {
      await api.patch(`/clients/${client.id}/portal-permissions`, {
        [key]: next,
      });

      await load();
    } catch (err) {
      setPortalError(
        getErrorMessage(err, "Failed to update portal permission")
      );
    } finally {
      setPortalSaving(null);
    }
  }

  return (
    <div>
      <style>
        {`
          @keyframes clientDetailSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {loading && !client ? (
        <div
          style={{
            minHeight: 300,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 30,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: "4px solid #e5e7eb",
              borderTop: "4px solid #2563eb",
              borderRadius: "50%",
              animation: "clientDetailSpin 0.8s linear infinite",
            }}
          />

          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Loading...
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            Please wait while we fetch client details.
          </div>
        </div>
      ) : error && !client ? (
        <div
          style={{
            minHeight: 250,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 30,
          }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>

          <button className="primary" onClick={load}>
            Try Again
          </button>

          <button onClick={() => navigate("/clients")}>
            Back to Clients
          </button>
        </div>
      ) : client ? (
        <>
          <div className="page-header">
            <h1>{client.name}</h1>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span className={`badge status-${client.status}`}>
                {client.status}
              </span>

              {auth?.role === "MANAGING_PARTNER" && (
                <button className="secondary" onClick={handleDelete}>
                  Delete Client
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="error-text" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div className="card">
            <h3>Profile</h3>

            {!editing && (
              <>
                <p>
                  <strong>Client ID:</strong> {client.clientId}
                </p>

                <p>
                  <strong>Type:</strong> {client.type ?? "—"}
                </p>

                <p>
                  <strong>Email:</strong> {client.email ?? "—"}
                </p>

                <p>
                  <strong>Phone:</strong> {client.phone ?? "—"}
                </p>

                <p>
                  <strong>Address:</strong> {client.address ?? "—"}
                </p>

                {canEdit && (
                  <button style={{ marginTop: 8 }} onClick={startEdit}>
                    Edit Profile
                  </button>
                )}
              </>
            )}

            {editing && (
              <form onSubmit={handleSave}>
                <label htmlFor="editName">
                  Full Name / Company Name
                </label>
                <input
                  id="editName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                <label htmlFor="editType">
                  Client Type (optional)
                </label>
                <SearchableSelect
                  id="editType"
                  category="CLIENT_TYPE"
                  value={type}
                  onChange={setType}
                  placeholder="Select a type…"
                />

                <label htmlFor="editEmail">Email (optional)</label>
                <input
                  id="editEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <label htmlFor="editPhone">Phone (optional)</label>
                <input
                  id="editPhone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />

                <label htmlFor="editAddress">Address (optional)</label>
                <textarea
                  id="editAddress"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <button className="primary" type="submit">
                    Save
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="card">
            <h3>Portal Permissions</h3>

            <p
              className="muted"
              style={{ fontSize: "0.85em", marginTop: -8 }}
            >
              Controls what this client can see when they log in to the
              Client Portal.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                rowGap: 10,
                columnGap: 16,
                alignItems: "center",
              }}
            >
              <span>List of Cases</span>

              <span
                className={`badge status-${
                  client.portalCasesEnabled ? "ACTIVE" : "INACTIVE"
                }`}
              >
                {client.portalCasesEnabled ? "ON" : "OFF"}
              </span>

              <input
                type="checkbox"
                checked={client.portalCasesEnabled}
                disabled={!canManagePortalAccess || portalSaving !== null}
                onChange={(e) =>
                  togglePortalPermission(
                    "portalCasesEnabled",
                    e.target.checked
                  )
                }
              />

              <span>Hearing History</span>

              <span
                className={`badge status-${
                  client.portalHearingHistoryEnabled
                    ? "ACTIVE"
                    : "INACTIVE"
                }`}
              >
                {client.portalHearingHistoryEnabled ? "ON" : "OFF"}
              </span>

              <input
                type="checkbox"
                checked={client.portalHearingHistoryEnabled}
                disabled={!canManagePortalAccess || portalSaving !== null}
                onChange={(e) =>
                  togglePortalPermission(
                    "portalHearingHistoryEnabled",
                    e.target.checked
                  )
                }
              />

              <span>Documents</span>

              <span
                className={`badge status-${
                  client.portalDocumentsEnabled ? "ACTIVE" : "INACTIVE"
                }`}
              >
                {client.portalDocumentsEnabled ? "ON" : "OFF"}
              </span>

              <input
                type="checkbox"
                checked={client.portalDocumentsEnabled}
                disabled={!canManagePortalAccess || portalSaving !== null}
                onChange={(e) =>
                  togglePortalPermission(
                    "portalDocumentsEnabled",
                    e.target.checked
                  )
                }
              />
            </div>

            {portalSaving && (
              <p className="muted" style={{ fontSize: 13 }}>
                Updating permission...
              </p>
            )}

            {portalError && (
              <p className="error-text">{portalError}</p>
            )}
          </div>

          <div className="card">
            <h3>Linked Matters</h3>

            {client.cases.length === 0 && (
              <p className="muted">No matters linked yet.</p>
            )}

            {client.cases.map((c) => (
              <p key={c.case.id}>
                <Link to={`/cases/${c.case.id}`}>
                  {c.case.matterNumber}
                </Link>

                {c.case.title ? ` — ${c.case.title}` : " "}

                <span className={`badge status-${c.case.status}`}>
                  {c.case.status}
                </span>
              </p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
