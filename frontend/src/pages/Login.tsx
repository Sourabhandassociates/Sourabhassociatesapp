import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../api/errorMessage";

/** Renders the firm logo if `frontend/public/logo.png` exists; falls back to a
 * plain brand-color square (never a broken-image icon) until it's supplied. */
function LoginLogo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="brand-mark" />;
  return <img src="/logo.png" alt="S&A LEGAL" onError={() => setFailed(true)} />;
}

export default function Login() {
  const [mode, setMode] = useState<"staff" | "client">("staff");
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Milestone 4 (SRD Section 28 — MFA) — set once loginStaff reports mfaRequired;
   * the form then swaps to a second-factor code prompt instead of email/password. */
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const { loginStaff, completeMfaLogin, loginClient } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "staff") {
        const result = await loginStaff(email, password);
        if (result?.mfaRequired) {
          setMfaChallengeToken(result.mfaChallengeToken);
          return;
        }
      } else {
        await loginClient(clientId, password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeMfaLogin(mfaChallengeToken, mfaCode);
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid authentication code"));
    } finally {
      setSubmitting(false);
    }
  }

  if (mfaChallengeToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <LoginLogo />
          </div>
          <h1>S&amp;A LEGAL</h1>
          <p className="subtitle">Two-Factor Authentication</p>

          <form onSubmit={handleMfaSubmit}>
            <label htmlFor="mfaCode">Authenticator Code or Backup Code</label>
            <input
              id="mfaCode"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoFocus
              required
            />
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => {
                setMfaChallengeToken(null);
                setMfaCode("");
                setError(null);
              }}
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <LoginLogo />
        </div>
        <h1>S&amp;A LEGAL</h1>
        <p className="subtitle">Law Firm Management Portal</p>

        <div className="tab-row">
          <button type="button" className={mode === "staff" ? "active" : ""} onClick={() => setMode("staff")}>
            Staff Login
          </button>
          <button
            type="button"
            className={mode === "client" ? "active" : ""}
            onClick={() => setMode("client")}
          >
            Client Login
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "staff" ? (
            <>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="clientId">Client ID</label>
              <input
                id="clientId"
                placeholder="SA-CLI-000001"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              />
            </>
          )}

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="error-text">{error}</p>}

          <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
