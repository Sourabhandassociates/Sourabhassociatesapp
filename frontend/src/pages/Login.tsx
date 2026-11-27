import { AppLoader } from "../components/AppLoader";

import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../api/errorMessage";

/** Renders the firm logo if frontend/public/logo.png exists */
function LoginLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) return <div className="brand-mark" />;

  return (
    <img
      src="/logo.png"
      alt="S&A LEGAL"
      onError={() => setFailed(true)}
    />
  );
}

export default function Login() {
  const [mode, setMode] = useState<"staff" | "client">("staff");
  const [email, setEmail] = useState("");
  const [clientIdentifier, setClientIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** MFA */
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
        await loginClient(clientIdentifier, password);
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

  /** MFA Verification Screen */
  if (mfaChallengeToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <LoginLogo />
          </div>

          <h1>S&amp;A LEGAL</h1>

          <form onSubmit={handleMfaSubmit}>
            <label htmlFor="mfaCode">
              Authenticator Code or Backup Code
            </label>

            <input
              id="mfaCode"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoFocus
              required
            />

            {error && <p className="error-text">{error}</p>}

            <button
              className="primary"
              type="submit"
              disabled={submitting}
              style={{ width: "100%" }}
            >
              {submitting ? <AppLoader size="sm" inline /> : "Verify"}
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

  /** Login Screen */
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <LoginLogo />
        </div>

        <h1>S&amp;A LEGAL</h1>

        <p className="subtitle">Law Firm Management Portal</p>

        {/* Login Tabs */}
        <div className="tab-row">
          <button
            type="button"
            className={mode === "staff" ? "active" : ""}
            onClick={() => setMode("staff")}
          >
            Associates Login
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
          {/* Staff Email / Client ID or registered client name */}
          {mode === "staff" ? (
            <>
              <label htmlFor="email">Email</label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter Your Email"
              />
            </>
          ) : (
            <>
              <label htmlFor="clientIdentifier">Client ID or User Name</label>

              <input
                id="clientIdentifier"
                placeholder="Enter Client ID or User Name"
                value={clientIdentifier}
                onChange={(e) => setClientIdentifier(e.target.value)}
                required
              />
            </>
          )}

          {/* Password with Eye Icon Inside Input */}
          <label htmlFor="password">Password</label>

          <div style={{ position: "relative", width: "100%" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter Your Password"
              style={{
                width: "100%",
                paddingRight: "45px",
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              style={{
                position: "absolute",
                right: "10px",
                top: "38%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "4px",
                margin: 0,
                cursor: "pointer",
                color: "#777",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
              }}
            >
              {showPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && <p className="error-text">{error}</p>}

          {/* Submit Button */}
          <button
            className="primary"
            type="submit"
            disabled={submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
