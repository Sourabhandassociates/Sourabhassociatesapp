import { FormEvent, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

/** Milestone 4 (Version 1.0 completion, SRD Section 28 — MFA). Self-service
 * enrollment/disable for every staff role — mandatory only in the sense that
 * Managing Partner/Accounts Team see a setup nudge after login (see the banner
 * this page is linked from), not a route-level block. */
export default function MfaSettings() {
  const [step, setStep] = useState<"idle" | "enrolling" | "backupCodes">("idle");
  const [secret, setSecret] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnrollment() {
    setError(null);
    const res = await api.post("/auth/mfa/enroll/begin");
    setSecret(res.data.secret);
    setQrCodeDataUrl(res.data.qrCodeDataUrl);
    setStep("enrolling");
  }

  async function confirmEnrollment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post("/auth/mfa/enroll/confirm", { secret, code });
      setBackupCodes(res.data.backupCodes);
      setStep("backupCodes");
      setCode("");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid authentication code"));
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/mfa/disable", { password: disablePassword });
      setDisablePassword("");
      window.location.reload();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to disable MFA — check your password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Two-Factor Authentication</h1>
      </div>

      {step === "idle" && (
        <div className="card">
          <p>
            Protect your account with an authenticator app (Google Authenticator, Authy, etc.) in addition to your
            password.
          </p>
          <button className="primary" onClick={startEnrollment}>
            Set Up Two-Factor Authentication
          </button>

          <h3 style={{ marginTop: 24 }}>Disable Two-Factor Authentication</h3>
          <form onSubmit={disableMfa} style={{ maxWidth: 320 }}>
            <label htmlFor="disablePassword">Current Password</label>
            <input
              id="disablePassword"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              required
            />
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={busy}>
              Disable
            </button>
          </form>
        </div>
      )}

      {step === "enrolling" && (
        <div className="card">
          <h3>Scan this QR Code</h3>
          <p className="muted">Scan with your authenticator app, then enter the 6-digit code it generates.</p>
          {qrCodeDataUrl && <img src={qrCodeDataUrl} alt="MFA enrollment QR code" style={{ maxWidth: 220 }} />}
          <p className="muted">Can't scan? Enter this key manually: {secret}</p>
          <form onSubmit={confirmEnrollment} style={{ maxWidth: 240 }}>
            <label htmlFor="mfaConfirmCode">Authenticator Code</label>
            <input id="mfaConfirmCode" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              Confirm
            </button>
          </form>
        </div>
      )}

      {step === "backupCodes" && (
        <div className="card">
          <h3>Two-Factor Authentication Enabled</h3>
          <p>
            Save these one-time backup codes somewhere safe. Each can be used once if you lose access to your
            authenticator app. They will not be shown again.
          </p>
          <div className="table-scroll">
            <table>
              <tbody>
                {Array.from({ length: Math.ceil(backupCodes.length / 2) }, (_, row) => (
                  <tr key={row}>
                    <td>
                      <code>{backupCodes[row * 2]}</code>
                    </td>
                    <td>
                      <code>{backupCodes[row * 2 + 1] ?? ""}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
