import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";

/** New Case form simplification (2026-08-11) — title is now optional. */
interface MatterLink {
  case: { id: string; matterNumber: string; title: string | null; status: string };
}
interface ContactDetail {
  id: string;
  name: string;
  category: string;
  organization: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  matters: MatterLink[];
}
interface CaseOption {
  id: string;
  matterNumber: string;
  title: string | null;
}

/** SRD Section 12 — Contact Directory: profile, linked matters, notes. */
export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get(`/contacts/${id}`).then((res) => setContact(res.data));
  }, [id]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    api.get("/cases").then((res) => setCases(res.data));
  }, []);

  const canDelete = auth?.role === "MANAGING_PARTNER" || auth?.role === "ASSOCIATE" || auth?.role === "OFFICE_STAFF";

  if (!contact) return <p>Loading…</p>;

  async function handleDelete() {
    if (!window.confirm(`Move contact "${contact!.name}" to the Recycle Bin?`)) return;
    await api.delete(`/contacts/${contact!.id}`);
    navigate("/contacts");
  }

  async function handleLinkMatter(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedCaseId) return;
    try {
      await api.post(`/contacts/${id}/matters`, { caseId: selectedCaseId });
      setSelectedCaseId("");
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to link matter"));
    }
  }

  async function handleUnlinkMatter(caseId: string) {
    await api.delete(`/contacts/${id}/matters/${caseId}`);
    load();
  }

  const linkedCaseIds = new Set(contact.matters.map((m) => m.case.id));
  const linkableCases = cases.filter((c) => !linkedCaseIds.has(c.id));

  return (
    <div>
      <div className="page-header">
        <h1>{contact.name}</h1>
        {canDelete && (
          <button className="secondary" onClick={handleDelete}>
            Delete Contact
          </button>
        )}
      </div>

      <div className="card">
        <h3>Profile</h3>
        <p>
          <strong>Category:</strong> {contact.category}
        </p>
        <p>
          <strong>Organization:</strong> {contact.organization ?? "—"}
        </p>
        <p>
          <strong>Designation:</strong> {contact.designation ?? "—"}
        </p>
        <p>
          <strong>Email:</strong> {contact.email ?? "—"}
        </p>
        <p>
          <strong>Phone:</strong> {contact.phone ?? "—"}
        </p>
        <p>
          <strong>Notes:</strong> {contact.notes ?? "—"}
        </p>
      </div>

      <div className="card">
        <h3>Linked Matters</h3>
        {contact.matters.length === 0 && <p className="muted">No matters linked yet.</p>}
        {contact.matters.map((m) => (
          <p key={m.case.id}>
            <Link to={`/cases/${m.case.id}`}>{m.case.matterNumber}</Link>
            {m.case.title ? ` — ${m.case.title}` : ""}{" "}
            <span className={`badge status-${m.case.status}`}>{m.case.status}</span>{" "}
            <button className="secondary" onClick={() => handleUnlinkMatter(m.case.id)}>
              Unlink
            </button>
          </p>
        ))}

        <form onSubmit={handleLinkMatter} style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="matter">Link a matter</label>
            <select id="matter" value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}>
              <option value="">Select…</option>
              {linkableCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ? `${c.matterNumber} — ${c.title}` : c.matterNumber}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" type="submit" disabled={!selectedCaseId}>
            Link
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
