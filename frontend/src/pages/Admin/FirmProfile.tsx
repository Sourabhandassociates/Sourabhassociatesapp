import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";

interface FirmProfileData {
  firmName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  pan: string | null;
  website: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
  /** Invoice-PDF-refinements pass (2026-08-06) — computed by the backend from
   * whether `payment-qr.png`/`.jpg` currently exists, not a DB column. */
  hasQrCode: boolean;
  updatedAt: string | null;
}

const BLANK_FORM = {
  firmName: "",
  address: "",
  phone: "",
  email: "",
  pan: "",
  website: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifsc: "",
  branch: "",
};

type FormState = typeof BLANK_FORM;

const DETAIL_ROWS: { label: string; key: keyof FirmProfileData }[] = [
  { label: "Firm Name", key: "firmName" },
  { label: "Address", key: "address" },
  { label: "Phone", key: "phone" },
  { label: "Email", key: "email" },
  { label: "Website", key: "website" },
  { label: "PAN", key: "pan" },
];

const BANK_ROWS: { label: string; key: keyof FirmProfileData }[] = [
  { label: "Bank Name", key: "bankName" },
  { label: "Account Holder Name", key: "accountHolderName" },
  { label: "Account Number", key: "accountNumber" },
  { label: "IFSC Code", key: "ifsc" },
  { label: "Branch", key: "branch" },
];

/** Milestone 4 (Version 1.0 completion, SRD Section 24 — Firm Profile), extended by
 * the invoice-module completion pass (2026-08-06) with Billing & Payment Settings
 * (bank/UPI details) and a logo uploader — both "automatically populate every
 * invoice" per FirmProfile's schema doc comment, read live by the PDF generator.
 * View is firm-wide (FIRM_PROFILE.VIEW default true for every role); editing is
 * Managing-Partner-only (FIRM_PROFILE.MANAGE). */
export default function FirmProfile() {
  const { auth } = useAuth();
  const canEdit = auth?.role === "MANAGING_PARTNER";
  const [profile, setProfile] = useState<FirmProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [qrDisplayExt, setQrDisplayExt] = useState<"png" | "jpg" | "failed">("png");

  function load() {
    api.get("/firm-profile").then((res) => setProfile(res.data));
  }
  useEffect(() => load(), []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit() {
    if (!profile) return;
    setForm({
      firmName: profile.firmName,
      address: profile.address ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      pan: profile.pan ?? "",
      website: profile.website ?? "",
      bankName: profile.bankName ?? "",
      accountHolderName: profile.accountHolderName ?? "",
      accountNumber: profile.accountNumber ?? "",
      ifsc: profile.ifsc ?? "",
      branch: profile.branch ?? "",
    });
    setEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, k === "firmName" ? v : v || undefined])
      );
      await api.put("/firm-profile", payload);
      setEditing(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update firm profile"));
    }
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    setLogoError(null);
    setLogoFile(e.target.files?.[0] ?? null);
  }

  async function handleLogoUpload() {
    if (!logoFile) return;
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("logo", logoFile);
      await api.put("/firm-profile/logo", form, { headers: { "Content-Type": "multipart/form-data" } });
      setLogoFile(null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setLogoError(getErrorMessage(err, "Failed to upload logo"));
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleQrChange(e: ChangeEvent<HTMLInputElement>) {
    setQrError(null);
    const file = e.target.files?.[0] ?? null;
    setQrFile(file);
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    setQrPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleQrUpload() {
    if (!qrFile) return;
    setQrError(null);
    setUploadingQr(true);
    try {
      const form = new FormData();
      form.append("qrCode", qrFile);
      await api.put("/firm-profile/qr-code", form, { headers: { "Content-Type": "multipart/form-data" } });
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
      setQrFile(null);
      setQrPreviewUrl(null);
      setQrDisplayExt("png");
      setQrVersion((v) => v + 1);
      load();
    } catch (err) {
      setQrError(getErrorMessage(err, "Failed to upload QR code"));
    } finally {
      setUploadingQr(false);
    }
  }

  if (!profile) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Firm Profile</h1>
      </div>

      {canEdit && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Firm Logo</h3>
          <p className="muted" style={{ fontSize: "0.85em" }}>
            Used on the web portal and on every generated invoice PDF.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src={`/logo.png?v=${logoVersion}`}
              alt="Firm logo"
              style={{ height: 48, width: "auto" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <input type="file" accept="image/png" onChange={handleLogoChange} />
            <button type="button" disabled={!logoFile || uploadingLogo} onClick={handleLogoUpload}>
              {uploadingLogo ? "Uploading…" : "Upload Logo"}
            </button>
          </div>
          {logoError && <p className="error-text">{logoError}</p>}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Firm Details</h3>
        {!editing && (
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 10, columnGap: 16 }}>
            {DETAIL_ROWS.map((row) => (
              <div key={row.key} style={{ display: "contents" }}>
                <div className="muted" style={{ fontSize: "0.85em" }}>
                  {row.label}
                </div>
                <div>{profile[row.key] || "—"}</div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave}>
            <label htmlFor="firmName">Firm Name</label>
            <input id="firmName" value={form.firmName} onChange={(e) => set("firmName", e.target.value)} required />
            <label htmlFor="firmAddress">Address</label>
            <input id="firmAddress" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <div className="form-grid">
              <div>
                <label htmlFor="firmPhone">Phone</label>
                <input id="firmPhone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <label htmlFor="firmEmail">Email</label>
                <input id="firmEmail" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
            <label htmlFor="firmWebsite">Website</label>
            <input id="firmWebsite" value={form.website} onChange={(e) => set("website", e.target.value)} />
            <label htmlFor="firmPan">PAN</label>
            <input id="firmPan" value={form.pan} onChange={(e) => set("pan", e.target.value)} />

            <h4>Billing & Payment Settings</h4>
            <p className="muted" style={{ fontSize: "0.85em", marginTop: -8 }}>
              Populates the Payment Details section and "Scan to Pay" QR on every invoice PDF.
            </p>
            <div className="form-grid">
              <div>
                <label htmlFor="bankName">Bank Name</label>
                <input id="bankName" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
              </div>
              <div>
                <label htmlFor="accountHolderName">Account Holder Name</label>
                <input
                  id="accountHolderName"
                  value={form.accountHolderName}
                  onChange={(e) => set("accountHolderName", e.target.value)}
                />
              </div>
            </div>
            <div className="form-grid">
              <div>
                <label htmlFor="accountNumber">Account Number</label>
                <input id="accountNumber" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
              </div>
              <div>
                <label htmlFor="ifsc">IFSC Code</label>
                <input id="ifsc" value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} />
              </div>
            </div>
            <label htmlFor="branch">Branch</label>
            <input id="branch" value={form.branch} onChange={(e) => set("branch", e.target.value)} />

            <label htmlFor="qrCodeFile">Payment QR Code (JPG or PNG)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {qrPreviewUrl ? (
                <img
                  src={qrPreviewUrl}
                  alt="QR code preview"
                  style={{ height: 100, width: 100, objectFit: "contain", border: "1px solid var(--color-border)", borderRadius: 4 }}
                />
              ) : (
                profile.hasQrCode &&
                qrDisplayExt !== "failed" && (
                  <img
                    src={`/payment-qr.${qrDisplayExt}?v=${qrVersion}`}
                    alt="Current payment QR code"
                    style={{ height: 100, width: 100, objectFit: "contain", border: "1px solid var(--color-border)", borderRadius: 4 }}
                    onError={() => setQrDisplayExt((ext) => (ext === "png" ? "jpg" : "failed"))}
                  />
                )
              )}
              <div>
                <input id="qrCodeFile" type="file" accept="image/png,image/jpeg" onChange={handleQrChange} />
                <div style={{ marginTop: 6 }}>
                  <button type="button" disabled={!qrFile || uploadingQr} onClick={handleQrUpload}>
                    {uploadingQr ? "Uploading…" : "Upload QR Code"}
                  </button>
                </div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.85em" }}>
              Shown as "Scan to Pay" on every invoice PDF. Leave unset to hide that section entirely.
            </p>
            {qrError && <p className="error-text">{qrError}</p>}

            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="primary" type="submit">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {canEdit && !editing && (
          <button style={{ marginTop: 12 }} onClick={startEdit}>
            Edit Firm Profile
          </button>
        )}
      </div>

      {!editing && (BANK_ROWS.some((r) => profile[r.key]) || profile.hasQrCode || canEdit) && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Billing & Payment Settings</h3>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 10, columnGap: 16 }}>
            {BANK_ROWS.map((row) => (
              <div key={row.key} style={{ display: "contents" }}>
                <div className="muted" style={{ fontSize: "0.85em" }}>
                  {row.label}
                </div>
                <div>{profile[row.key] || "—"}</div>
              </div>
            ))}
            <div className="muted" style={{ fontSize: "0.85em" }}>
              Payment QR Code
            </div>
            <div>
              {profile.hasQrCode && qrDisplayExt !== "failed" ? (
                <img
                  src={`/payment-qr.${qrDisplayExt}?v=${qrVersion}`}
                  alt="Payment QR code"
                  style={{ height: 100, width: 100, objectFit: "contain", border: "1px solid var(--color-border)", borderRadius: 4 }}
                  onError={() => setQrDisplayExt((ext) => (ext === "png" ? "jpg" : "failed"))}
                />
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
