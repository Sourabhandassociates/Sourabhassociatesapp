import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";

interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}

/**
 * New Case form simplification (2026-08-11) — reduced to exactly five optional
 * case-detail fields (Case Title, Case No. == `courtCaseNumber`, Case Type, Court
 * No. == the new `courtNumber`, Court Complex == `courtName`) plus the existing
 * Client/Client Role selection, unchanged. Every other field previously on this
 * screen (Practice Area, Jurisdiction, Case Stage, Opposite Party/Counsel, Filing
 * Date, Description, Managing Partner, Assigned Advocates) is removed from this
 * screen only — the underlying data/columns still exist and are still editable
 * from the Case Detail screen's "Edit Case Details" panel, and `partnerId` is now
 * auto-assigned server-side (`casesService.createCase`) rather than asked here.
 * Client selection remains mandatory — the one existing business rule this pass
 * explicitly carries forward as-is, per the Managing Partner's instructions.
 */
export default function NewCase() {
  const [title, setTitle] = useState("");
  const [courtCaseNumber, setCourtCaseNumber] = useState("");
  const [caseType, setCaseType] = useState("");
  const [courtNumber, setCourtNumber] = useState("");
  const [courtName, setCourtName] = useState("");
  const [clientId, setClientId] = useState("");
  const [partyRole, setPartyRole] = useState("Plaintiff");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/clients").then((res) => setClients(res.data));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) return setError("Select a client for this matter");
    try {
      const res = await api.post("/cases", {
        title: title || undefined,
        courtCaseNumber: courtCaseNumber || undefined,
        caseType: caseType || undefined,
        courtNumber: courtNumber || undefined,
        courtName: courtName || undefined,
        clients: [{ clientId, partyRole }],
      });
      navigate(`/cases/${res.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create case"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Case</h1>
      </div>
      <form className="card" style={{ maxWidth: 600 }} onSubmit={handleSubmit}>
        <label htmlFor="title">Case Title (optional)</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div className="form-grid">
          <div>
            <label htmlFor="courtCaseNumber">Case No. (optional)</label>
            <input id="courtCaseNumber" value={courtCaseNumber} onChange={(e) => setCourtCaseNumber(e.target.value)} />
          </div>
          <div>
            <label htmlFor="caseType">Case Type (optional)</label>
            <SearchableSelect id="caseType" category="CASE_TYPE" value={caseType} onChange={setCaseType} placeholder="Select a type…" />
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="courtNumber">Court No. (optional)</label>
            <input id="courtNumber" value={courtNumber} onChange={(e) => setCourtNumber(e.target.value)} />
          </div>
          <div>
            <label htmlFor="courtName">Court Complex (optional)</label>
            <SearchableSelect id="courtName" category="COURT" value={courtName} onChange={setCourtName} placeholder="Select a court…" />
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="client">Client</label>
            <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientId} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="partyRole">Client's Role in Matter</label>
            <input
              id="partyRole"
              value={partyRole}
              onChange={(e) => setPartyRole(e.target.value)}
              placeholder="Plaintiff / Defendant / Petitioner…"
            />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="primary" type="submit">
            Create Case
          </button>
          <button className="secondary" type="button" onClick={() => navigate("/cases")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
