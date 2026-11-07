
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorDetails, getErrorMessage } from "../../api/errorMessage";
import { SearchableSelect } from "../../components/SearchableSelect";
import {
  ConflictMatch,
  ConflictWarningModal,
} from "../../components/ConflictWarningModal";

function ButtonLoader() {
  return (
    <>
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 14,
          border: "2px solid currentColor",
          borderRightColor: "transparent",
          borderRadius: "50%",
          animation: "newClientLoaderSpin 0.7s linear infinite",
        }}
      />

      <style>
        {`
          @keyframes newClientLoaderSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </>
  );
}

/** Client-module optional-fields pass — only Client Name is mandatory. */
export default function NewClient() {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<{
    clientId: string;
    temporaryPassword: string;
  } | null>(null);

  const [conflicts, setConflicts] = useState<ConflictMatch[] | null>(
    null
  );

  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [conflictSubmitting, setConflictSubmitting] = useState(false);

  const navigate = useNavigate();

  async function submit(
    overrides?: {
      conflictAcknowledged: boolean;
      conflictReason: string;
    }
  ) {
    const res = await api.post("/clients", {
      name,
      type: type || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      ...overrides,
    });

    setResult({
      clientId: res.data.client.clientId,
      temporaryPassword: res.data.temporaryPassword,
    });
  }

  /** Advanced Conflict Check — possible matches require acknowledgement. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await submit();
    } catch (err) {
      const details = getErrorDetails<ConflictMatch[]>(err);

      if (details) {
        setConflicts(details);
        return;
      }

      setError(getErrorMessage(err, "Failed to create client"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConflictConfirm(reason: string) {
    setConflictSubmitting(true);

    try {
      await submit({
        conflictAcknowledged: true,
        conflictReason: reason,
      });

      setConflicts(null);
    } catch (err) {
      throw new Error(
        getErrorMessage(err, "Failed to create client")
      );
    } finally {
      setConflictSubmitting(false);
    }
  }

  async function handleBackToClients() {
    setNavigating(true);

    try {
      navigate("/clients");
    } finally {
      setNavigating(false);
    }
  }

  /* Success Screen */
  if (result) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h3>Client created successfully</h3>

        <p>
          <strong>Client ID:</strong> {result.clientId}
        </p>

        <p>
          <strong>Password:</strong> {result.temporaryPassword}
        </p>

        <p className="muted">
          Share these credentials with the client through a secure
          channel — automated delivery is a later-phase Notifications
          feature (SRD Section 17).
        </p>

        <button
          className="primary"
          onClick={handleBackToClients}
          disabled={navigating}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {navigating && <ButtonLoader />}
          {navigating ? "Please wait..." : "Back to Clients"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Conflict Warning Modal */}
      {conflicts && (
        <ConflictWarningModal
          matches={conflicts}
          onCancel={() => {
            if (!conflictSubmitting) {
              setConflicts(null);
            }
          }}
          onConfirm={handleConflictConfirm}
        />
      )}

      <div className="page-header">
        <h1>New Client</h1>
      </div>

      <form
        className="card"
        style={{ maxWidth: 480 }}
        onSubmit={handleSubmit}
      >
        <label htmlFor="name">
          Full Name / Company Name
        </label>

        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={submitting || conflictSubmitting}
        />

        <label htmlFor="type">
          Client Type (optional)
        </label>

        <SearchableSelect
          id="type"
          category="CLIENT_TYPE"
          value={type}
          onChange={setType}
          placeholder="Select a type…"
        />

        <label htmlFor="email">
          Email (optional)
        </label>

        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting || conflictSubmitting}
        />

        <label htmlFor="phone">
          Phone (optional)
        </label>

        <input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting || conflictSubmitting}
        />

        <label htmlFor="address">
          Address (optional)
        </label>

        <textarea
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          disabled={submitting || conflictSubmitting}
        />

        {error && (
          <p className="error-text" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}

        <div className="form-actions">
          <button
            className="primary"
            type="submit"
            disabled={submitting || conflictSubmitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting && <ButtonLoader />}
            {submitting ? "Creating Client..." : "Create Client"}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={() => navigate("/clients")}
            disabled={submitting || conflictSubmitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
