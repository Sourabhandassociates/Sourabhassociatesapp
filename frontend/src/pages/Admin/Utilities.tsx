import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { Breadcrumbs } from "../../components/Breadcrumbs";

interface UtilityTile {
  to: string;
  label: string;
  description: string;
  icon: typeof Upload;
}

/**
 * Admin Settings -> Utilities (2026-08-12) — one-time/occasional administrative tools,
 * split out of the main sidebar so it stays limited to daily operational modules
 * (SRD Section 25). Data Import is the only tool moved here — "Data Export" isn't a
 * separate screen (it's the Reports screen's own PDF/Excel export), and no Backup/
 * Restore feature exists anywhere in the app to relocate (confirmed with the Managing
 * Partner before implementing, rather than fabricating placeholders for functionality
 * that was never built). Gated the same as Data Import always was — DATA_IMPORT.RUN's
 * default roles (Managing Partner, Office Staff) — so this reorganization changes
 * nothing about who can do what, only where the entry point lives.
 */
const UTILITIES: UtilityTile[] = [
  {
    to: "/admin/utilities/data-import",
    label: "Data Import",
    description: "Bulk-import Clients, Matters, or Contacts from an Excel template.",
    icon: Upload,
  },
];

export default function Utilities() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Admin Settings", to: "/admin/dropdowns" }, { label: "Utilities" }]} />
      <div className="page-header">
        <h1>Utilities</h1>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        One-time or occasional administrative tools — not part of daily case/client operations.
      </p>
      <div className="form-grid">
        {UTILITIES.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <tool.icon size={18} />
              <strong>{tool.label}</strong>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
