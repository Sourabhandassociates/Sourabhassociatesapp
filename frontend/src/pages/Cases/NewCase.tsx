
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";
import { AppLoader } from "../../components/AppLoader";

interface ClientOption {
  id: string;
  clientId: string;
  name: string;
}

export default function NewCase() {
  const [title, setTitle] = useState("");
  const [courtCaseNumber, setCourtCaseNumber] = useState("");
  const [caseType, setCaseType] = useState("");
  const [stage, setStage] = useState("");
  const [practiceArea, setPracticeArea] = useState("");
  const [courtNumber, setCourtNumber] = useState("");
  const [courtName, setCourtName] = useState("");
  const [bundleNumber, setBundleNumber] = useState("");

  const [clientId, setClientId] = useState("");
  const [partyRole, setPartyRole] = useState("Plaintiff");
  const [clients, setClients] = useState<ClientOption[]>([]);

  const [loadingClients, setLoadingClients] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  const [newClientName, setNewClientName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const navigate = useNavigate();

  async function loadClients() {
    setLoadingClients(true);
    try {
      const res = await api.get("/clients");
      setClients(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load clients"));
    } finally {
      setLoadingClients(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function handleAddClient(e: FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!newClientName.trim()) {
      setClientError("Enter the client name");
      return;
    }

    setSavingClient(true);

    try {
      const res = await api.post("/clients", {
        name: newClientName.trim(),
      });

      const createdClient: ClientOption = res.data.client;
      setClients((prev) => [...prev, createdClient]);
      setClientId(createdClient.id);

      setNewClientName("");
      setAddingClient(false);
    } catch (err) {
      setClientError(getErrorMessage(err, "Failed to add client"));
    } finally {
      setSavingClient(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Select a client for this matter");
      return;
    }

    if (!caseType.trim() || !courtCaseNumber.trim() || !courtNumber.trim()) {
      setError("Enter the Case Type, Court Case Number, and Court Number.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.post("/cases", {
        title: title || undefined,
        courtCaseNumber: courtCaseNumber.trim(),
        caseType: caseType.trim(),
        stage: stage.trim() || undefined,
        practiceArea: practiceArea.trim() || undefined,
        courtNumber: courtNumber.trim(),
        courtName: courtName || undefined,
        bundleNumber: bundleNumber.trim() || undefined,
        clients: [{ clientId, partyRole }],
      });

      navigate(`/cases/${res.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create case"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Case</h1>
      </div>

      <form className="card" style={{ maxWidth: 600 }} onSubmit={handleSubmit}>
        <label htmlFor="title">Case Title (optional)</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="form-grid">
          <div>
            <label htmlFor="courtCaseNumber">Court Case No.</label>
            <input
              id="courtCaseNumber"
              value={courtCaseNumber}
              onChange={(e) => setCourtCaseNumber(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="caseType">Case Type</label>
            <SearchableSelect
              id="caseType"
              category="CASE_TYPE"
              value={caseType}
              onChange={setCaseType}
              placeholder="Select a type…"
              required
            />
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="caseStage">Case Stage</label>
            <SearchableSelect
              id="caseStage"
              category="CASE_STAGE"
              value={stage}
              onChange={setStage}
              placeholder="Select case stage…"
            />
          </div>
          <div>
            <label htmlFor="practiceArea">Practice Area</label>
            <SearchableSelect
              id="practiceArea"
              category="PRACTICE_AREA"
              value={practiceArea}
              onChange={setPracticeArea}
              placeholder="Select practice area…"
            />
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="bundleNumber">Bundle Number</label>
            <input
              id="bundleNumber"
              value={bundleNumber}
              onChange={(e) => setBundleNumber(e.target.value)}
              placeholder="Enter Bundle Number"
            />
          </div>
          <div>
            <label htmlFor="courtNumber">Court No.</label>
            <input
              id="courtNumber"
              value={courtNumber}
              onChange={(e) => setCourtNumber(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="courtName">Court Complex (optional)</label>
            <SearchableSelect
              id="courtName"
              category="COURT"
              value={courtName}
              onChange={setCourtName}
              placeholder="Select a court…"
            />
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label htmlFor="client">Client</label>

            <select
              id="client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              disabled={loadingClients}
            >
              <option value="">
                {loadingClients ? "" : "Select client…"}
              </option>

              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientId} — {c.name}
                </option>
              ))}
            </select>

            {loadingClients && <AppLoader size="sm" />}
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

        <button
          type="button"
          className="secondary"
          onClick={() => {
            setAddingClient(!addingClient);
            setClientError(null);
          }}
          disabled={loadingClients}
        >
          {addingClient ? "Cancel Add Client" : "+ Add New Client"}
        </button>

        {addingClient && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Add New Client</h3>

            <label htmlFor="newClientName">Client Name</label>
            <input
              id="newClientName"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Enter client name"
              required
            />

            {clientError && (
              <p className="error-text">{clientError}</p>
            )}

            <button
              type="button"
              className="primary"
              onClick={(e) =>
                handleAddClient(e as unknown as FormEvent)
              }
              disabled={savingClient}
            >
              {savingClient ? <AppLoader size="sm" inline /> : "Save Client"}
            </button>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button
            className="primary"
            type="submit"
            disabled={submitting || loadingClients || clients.length === 0}
          >
            {submitting ? <AppLoader size="sm" inline /> : "Create Case"}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={() => navigate("/cases")}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
