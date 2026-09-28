import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

interface ClientDirectoryRow {
  id: string;
  contactName: string;
  email: string | null;
  mobile: string | null;
  client: { id: string; clientId: string; name: string; type: string | null; status: string; address: string | null };
}

interface OtherContact {
  id: string;
  name: string;
  category: string;
  organization: string | null;
  phone: string | null;
  email: string | null;
}

type Tab = "clients" | "other";

/**
 * Contacts redesign pass (2026-08-07b) — a single top-level "Contacts" module again
 * (restored from Admin Settings to its own sidebar item), covering two distinct
 * things under one screen:
 *
 *  - **Client Contacts** (default tab): an auto-synced, read-only directory mirror
 *    of every Client's own contact info. Client is the single source of truth —
 *    there is no add/edit/delete here; a row links straight to that Client's
 *    profile, which is where the underlying data actually gets changed.
 *  - **Other Contacts**: the original manually-managed directory of non-client
 *    professional contacts (Judges, Opposing Counsel, CAs, vendors) — unchanged
 *    create/edit/delete workflow, still gated by CONTACTS.CREATE/EDIT/DELETE.
 */
export default function ContactList() {
  const [tab, setTab] = useState<Tab>("clients");
  const [directory, setDirectory] = useState<ClientDirectoryRow[]>([]);
  const [otherContacts, setOtherContacts] = useState<OtherContact[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  function loadDirectory(q = "") {
    api.get("/contacts/client-directory", { params: q ? { search: q } : {} }).then((res) => setDirectory(res.data));
  }
  function loadOther(q = "") {
    api.get("/contacts", { params: q ? { search: q } : {} }).then((res) => setOtherContacts(res.data));
  }

  useEffect(() => {
    setSearch("");
    if (tab === "clients") loadDirectory();
    else loadOther();
  }, [tab]);

  function onSearchChange(value: string) {
    setSearch(value);
    if (tab === "clients") loadDirectory(value);
    else loadOther(value);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Contacts</h1>
        {tab === "other" && (
          <button className="primary" onClick={() => navigate("/contacts/new")}>
            + New Contact
          </button>
        )}
      </div>

      <div className="tab-row">
        <button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}>
          Client Contacts
        </button>
        <button className={tab === "other" ? "active" : ""} onClick={() => setTab("other")}>
          Other Contacts
        </button>
      </div>

      {tab === "clients" && (
        <p className="muted" style={{ marginTop: -8 }}>
          Every Client's own contact info, kept automatically in sync — edit it from that Client's profile, not here.
        </p>
      )}
      {tab === "other" && (
        <p className="muted" style={{ marginTop: -8 }}>
          Firm-wide professional contacts not tied to a specific client — Judges, Opposing Counsel, CAs, vendors, etc.
        </p>
      )}

      <input
        placeholder={tab === "clients" ? "Search by contact or client name…" : "Search by name or organization…"}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ maxWidth: 320 }}
      />

      {tab === "clients" && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Client Name</th>
                <th>Client Type</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Address</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {directory.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => navigate(`/clients/${row.client.id}`)}>
                  <td>{row.contactName}</td>
                  <td>{row.client.name}</td>
                  <td>{row.client.type ?? "—"}</td>
                  <td>{row.mobile ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                  <td>{row.client.address ?? "—"}</td>
                  <td>
                    <span className={`badge status-${row.client.status}`}>{row.client.status}</span>
                  </td>
                  <td>
                    <button
                      className="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clients/${row.client.id}`);
                      }}
                    >
                      View Client
                    </button>
                  </td>
                </tr>
              ))}
              {directory.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No client contacts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "other" && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Organization</th>
                <th>Phone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {otherContacts.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <td>{c.name}</td>
                  <td>{c.category}</td>
                  <td>{c.organization ?? "—"}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                </tr>
              ))}
              {otherContacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No contacts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
