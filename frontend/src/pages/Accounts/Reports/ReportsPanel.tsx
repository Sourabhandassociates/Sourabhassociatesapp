import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { downloadFile } from "../../../utils/downloadFile";

interface ReportTable {
  title: string;
  generatedAt: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
}

const PRESETS = [
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This Week" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "PREVIOUS_MONTH", label: "Previous Month" },
  { value: "FINANCIAL_YEAR", label: "Financial Year" },
  { value: "CUSTOM", label: "Custom Range" },
];

/** ACCOUNTS module (2026-08-14, §25) — report picker + date-range presets + export. */
export function ReportsPanel() {
  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState("");
  const [preset, setPreset] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [table, setTable] = useState<ReportTable | null>(null);

  useEffect(() => {
    api.get<string[]>("/accounts/reports/types").then((res) => {
      setTypes(res.data);
      setType(res.data[0] ?? "");
    });
  }, []);

  function runReport() {
    if (!type) return;
    api
      .get<ReportTable>(`/accounts/reports/${type}`, { params: { preset: preset || undefined, startDate, endDate } })
      .then((res) => setTable(res.data));
  }

  function exportReport(format: "pdf" | "excel" | "csv") {
    if (!type) return;
    const ext = format === "excel" ? "xlsx" : format;
    downloadFile(
      `/accounts/reports/${type}`,
      { preset: preset || undefined, startDate, endDate, format },
      `${type}.${ext}`
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label>Report</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Date Range</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">All time</option>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "CUSTOM" && (
          <>
            <div>
              <label>From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label>To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        )}
        <button onClick={runReport}>Run Report</button>
        {table && (
          <>
            <button className="secondary" onClick={() => exportReport("pdf")}>
              Export PDF
            </button>
            <button className="secondary" onClick={() => exportReport("excel")}>
              Export Excel
            </button>
            <button className="secondary" onClick={() => exportReport("csv")}>
              Export CSV
            </button>
          </>
        )}
      </div>

      {table && (
        <div className="card">
          <h3>{table.title}</h3>
          <p className="muted">Generated {new Date(table.generatedAt).toLocaleString()}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {table.columns.map((c) => (
                      <td key={c.key}>{row[c.key]}</td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="muted">
                      No data for this range.
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
