import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { downloadFile } from "../../utils/downloadFile";

interface ReportTable {
  title: string;
  generatedAt: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
}

const REPORT_LABELS: Record<string, string> = {
  "case-summary": "Case Summary",
  financial: "Financial",
  "matter-profitability": "Matter Profitability",
  "staff-performance": "Staff Performance",
  "hearing-outcome": "Hearing Outcome",
  "tag-based": "Tag-Based",
  "client-list": "Client List",
};

/** SRD Section 19 — Reports & Analytics. Report-type selector, date-range filters, an
 * on-screen table, and PDF/Excel export (Section 25) — one generic viewer/exporter
 * shared by every report type (backend/reports.service.ts's ReportTable). */
export default function Reports() {
  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [table, setTable] = useState<ReportTable | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<string[]>("/reports/types").then((res) => {
      setTypes(res.data);
      if (res.data.length > 0) setType(res.data[0]);
    });
  }, []);

  useEffect(() => {
    if (!type) return;
    setError("");
    const params: Record<string, string> = {};
    if (startDate) params.startDate = new Date(startDate).toISOString();
    if (endDate) params.endDate = new Date(endDate).toISOString();
    api
      .get<ReportTable>(`/reports/${type}`, { params })
      .then((res) => setTable(res.data))
      .catch(() => setError("Failed to load report"));
  }, [type, startDate, endDate]);

  function exportAs(format: "pdf" | "excel") {
    const params: Record<string, string> = { format };
    if (startDate) params.startDate = new Date(startDate).toISOString();
    if (endDate) params.endDate = new Date(endDate).toISOString();
    const ext = format === "pdf" ? "pdf" : "xlsx";
    downloadFile(`/reports/${type}`, params, `${type}-report.${ext}`);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Reports &amp; Analytics</h1>
      </div>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div>
          <label htmlFor="reportType">Report Type</label>
          <select id="reportType" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {REPORT_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="startDate">Start Date</label>
            <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="endDate">End Date</label>
            <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginBottom: 20 }}>
        <button type="button" className="secondary" onClick={() => exportAs("pdf")}>
          Export PDF
        </button>
        <button type="button" className="secondary" onClick={() => exportAs("excel")}>
          Export Excel
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {table && (
        <div className="card">
          <h3>{table.title}</h3>
          <p className="muted">Generated {new Date(table.generatedAt).toLocaleString()}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {table.columns.map((col) => (
                      <td key={col.key}>{row[col.key]}</td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="muted">
                      No data matches the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
