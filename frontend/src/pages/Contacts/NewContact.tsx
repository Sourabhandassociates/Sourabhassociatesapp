import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorDetails, getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";
import { ConflictMatch, ConflictWarningModal } from "../../components/ConflictWarningModal";

export default function NewContact() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [organization, setOrganization] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictMatch[] | null>(null);
  const navigate = useNavigate();

  async function submit(overrides?: { conflictAcknowledged: boolean; conflictReason: string }) {
    const res = await api.post("/contacts", {
      name,
      category,
      organization: organization || undefined,
      designation: designation || undefined,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
      ...overrides,
    });
    navigate(`/contacts/${res.data.id}`);
  }

  /** SRD Section 10.2 — Advanced Conflict Check, same flow as New Client. */
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
      setError(getErrorMessage(err, "Failed to create contact"));
    }
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
              throw new Error(getErrorMessage(err, "Failed to create contact"));
            }
          }}
        />
      )}
      <div className="page-header">
        <h1>New Contact</h1>
      </div>
      <form className="card" style={{ maxWidth: 480 }} onSubmit={handleSubmit}>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="category">Category</label>
        <SearchableSelect id="category" category="CONTACT_CATEGORY" value={category} onChange={setCategory} required />

        <label htmlFor="organization">Organization</label>
        <input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} />

        <label htmlFor="designation">Designation</label>
        <input id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />

        <div className="form-grid">
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <label htmlFor="notes">Notes</label>
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="primary" type="submit">
            Create Contact
          </button>
          <button className="secondary" type="button" onClick={() => navigate("/contacts")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
