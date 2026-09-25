import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorDetails, getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";
import { ConflictMatch, ConflictWarningModal } from "../../components/ConflictWarningModal";

/** Client-module optional-fields pass (2026-08-06) — only Client Name is
 * mandatory; Type/Email/Phone/Address may all be left blank here and filled in
 * later from the Client Detail screen's Edit Profile form. */
export default function NewClient() {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ clientId: string; temporaryPassword: string } | null>(null);
  const [conflicts, setConflicts] = useState<ConflictMatch[] | null>(null);
  const navigate = useNavigate();

  async function submit(overrides?: { conflictAcknowledged: boolean; conflictReason: string }) {
    const res = await api.post("/clients", {
      name,
      type: type || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      ...overrides,
    });
    setResult({ clientId: res.data.client.clientId, temporaryPassword: res.data.temporaryPassword });
  }

  /** SRD Section 10.2 — Advanced Conflict Check: a possible match blocks silent
   * creation with a 409, surfaced here as the warning modal rather than a plain error. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await submit();
    } catch (err) {
      const details = getErrorDetails<ConflictMatch[]>(err);
      if (details) {
        setConflicts(details);
        return;
      }
      setError(getErrorMessage(err, "Failed to create client"));
    }
  }

  if (result) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h3>Client created</h3>
        <p>
          <strong>Client ID:</strong> {result.clientId}
        </p>
        <p>
          <strong>Temporary password:</strong> {result.temporaryPassword}
        </p>
        <p className="muted">
          Share these credentials with the client through a secure channel — automated delivery is a
          later-phase Notifications feature (SRD Section 17).
        </p>
        <button className="primary" onClick={() => navigate("/clients")}>
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div>
      {conflicts && (
        <ConflictWarningModal
          matches={conflicts}
          onCancel={() => setConflicts(null)}
          onConfirm={async (reason) => {
            try {
              await submit({ conflictAcknowledged: true, conflictReason: reason });
              setConflicts(null);
            } catch (err) {
              throw new Error(getErrorMessage(err, "Failed to create client"));
            }
          }}
        />
      )}
      <div className="page-header">
        <h1>New Client</h1>
      </div>
      <form className="card" style={{ maxWidth: 480 }} onSubmit={handleSubmit}>
        <label htmlFor="name">Full Name / Company Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="type">Client Type (optional)</label>
        <SearchableSelect id="type" category="CLIENT_TYPE" value={type} onChange={setType} placeholder="Select a type…" />

        <label htmlFor="email">Email (optional)</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="phone">Phone (optional)</label>
        <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label htmlFor="address">Address (optional)</label>
        <textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="primary" type="submit">
            Create Client
          </button>
          <button className="secondary" type="button" onClick={() => navigate("/clients")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
