import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { SearchableSelect } from "../../components/SearchableSelect";

/** New Case form simplification (2026-08-11) — title is now optional. */
interface CaseLink {
  case: { id: string; matterNumber: string; title: string | null; status: string };
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
  /** Client Portal Permissions (2026-08-14). */
  portalCasesEnabled: boolean;
  portalHearingHistoryEnabled: boolean;
  portalDocumentsEnabled: boolean;
}

/** Client-module optional-fields pass (2026-08-06) — Type/Email/Phone/Address may
 * be blank (a client can be created with only a Name); this screen is where they
 * get added or changed afterward. Edit gated to the roles CLIENTS.EDIT defaults to
 * (permissionCatalogue.ts) — same client-side role-snapshot convention used
 * elsewhere in this app (e.g. Invoice creation's BILLING.CREATE_DRAFT gating).
 *
 * Contacts redesign pass (2026-08-07b) — this screen is the single source of truth
 * for a client's own contact info (Name/Type/Email/Phone/Address, all right here);
 * editing it here automatically keeps that client's entry on the Contacts module's
 * "Client Contacts" directory in sync (contacts.service.ts's `syncClientContact`,
 * called from clients.service.ts) — no separate Contacts tab or workflow on this
 * screen, by design (see the Contacts module's own redesign notes). */
export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const canEdit = auth?.role === "MANAGING_PARTNER" || auth?.role === "ASSOCIATE" || auth?.role === "OFFICE_STAFF";
  /** CLIENTS.MANAGE_PORTAL_ACCESS defaults to Managing-Partner-only — narrower than
   * canEdit above, matching the file's own existing role-snapshot convention. */
  const canManagePortalAccess = auth?.role === "MANAGING_PARTNER";
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalSaving, setPortalSaving] = useState<string | null>(null);

  function load() {
    api.get(`/clients/${id}`).then((res) => setClient(res.data));
  }
  useEffect(() => load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!client) return <p>Loading…</p>;

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
    setError(null);
    try {
      await api.patch(`/clients/${client!.id}`, { name, type, email, phone, address });
      setEditing(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update client"));
    }
  }

  /** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): never a real delete — the
   * client moves to the Recycle Bin, restorable/permanently-deletable by the Managing
   * Partner only (matching the backend's Managing-Partner-only DELETE /clients/:id). */
  async function handleDelete() {
    if (!window.confirm(`Move client ${client!.clientId} — ${client!.name} to the Recycle Bin?`)) return;
    await api.delete(`/clients/${client!.id}`);
    navigate("/clients");
  }

  /** Client Portal Permissions (2026-08-14) — each toggle fires its own PATCH and
   * takes effect immediately, no Edit/Save step (deliberately different from the
   * Profile card above, which batches a whole form behind Save). */
  async function togglePortalPermission(
    key: "portalCasesEnabled" | "portalHearingHistoryEnabled" | "portalDocumentsEnabled",
    next: boolean
  ) {
    setPortalError(null);
    setPortalSaving(key);
    try {
      await api.patch(`/clients/${client!.id}/portal-permissions`, { [key]: next });
      load();
    } catch (err) {
      setPortalError(getErrorMessage(err, "Failed to update portal permission"));
    } finally {
      setPortalSaving(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{client.name}</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className={`badge status-${client.status}`}>{client.status}</span>
          {auth?.role === "MANAGING_PARTNER" && (
            <button className="secondary" onClick={handleDelete}>
              Delete Client
            </button>
          )}
        </div>
      </div>

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
            <label htmlFor="editName">Full Name / Company Name</label>
            <input id="editName" value={name} onChange={(e) => setName(e.target.value)} required />

            <label htmlFor="editType">Client Type (optional)</label>
            <SearchableSelect id="editType" category="CLIENT_TYPE" value={type} onChange={setType} placeholder="Select a type…" />

            <label htmlFor="editEmail">Email (optional)</label>
            <input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

            <label htmlFor="editPhone">Phone (optional)</label>
            <input id="editPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />

            <label htmlFor="editAddress">Address (optional)</label>
            <textarea id="editAddress" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />

            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="primary" type="submit">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Portal Permissions</h3>
        <p className="muted" style={{ fontSize: "0.85em", marginTop: -8 }}>
          Controls what this client can see when they log in to the Client Portal.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", rowGap: 10, columnGap: 16, alignItems: "center" }}>
          <span>List of Cases</span>
          <span className={`badge status-${client.portalCasesEnabled ? "ACTIVE" : "INACTIVE"}`}>
            {client.portalCasesEnabled ? "ON" : "OFF"}
          </span>
          <input
            type="checkbox"
            checked={client.portalCasesEnabled}
            disabled={!canManagePortalAccess || portalSaving !== null}
            onChange={(e) => togglePortalPermission("portalCasesEnabled", e.target.checked)}
          />

          <span>Hearing History</span>
          <span className={`badge status-${client.portalHearingHistoryEnabled ? "ACTIVE" : "INACTIVE"}`}>
            {client.portalHearingHistoryEnabled ? "ON" : "OFF"}
          </span>
          <input
            type="checkbox"
            checked={client.portalHearingHistoryEnabled}
            disabled={!canManagePortalAccess || portalSaving !== null}
            onChange={(e) => togglePortalPermission("portalHearingHistoryEnabled", e.target.checked)}
          />

          <span>Documents</span>
          <span className={`badge status-${client.portalDocumentsEnabled ? "ACTIVE" : "INACTIVE"}`}>
            {client.portalDocumentsEnabled ? "ON" : "OFF"}
          </span>
          <input
            type="checkbox"
            checked={client.portalDocumentsEnabled}
            disabled={!canManagePortalAccess || portalSaving !== null}
            onChange={(e) => togglePortalPermission("portalDocumentsEnabled", e.target.checked)}
          />
        </div>
        {portalError && <p className="error-text">{portalError}</p>}
      </div>

      <div className="card">
        <h3>Linked Matters</h3>
        {client.cases.length === 0 && <p className="muted">No matters linked yet.</p>}
        {client.cases.map((c) => (
          <p key={c.case.id}>
            <Link to={`/cases/${c.case.id}`}>{c.case.matterNumber}</Link>
            {c.case.title ? ` — ${c.case.title}` : ""}{" "}
            <span className={`badge status-${c.case.status}`}>{c.case.status}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
