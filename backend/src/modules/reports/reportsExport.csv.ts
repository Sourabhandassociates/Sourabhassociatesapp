import { Response } from "express";
import { ReportTable } from "./reports.service";

/** No CSV exporter existed anywhere in this codebase before the ACCOUNTS module
 * (§25 requires it) — PDF/Excel already share the generic `ReportTable` shape via
 * reportsExport.pdf.ts/reportsExport.excel.ts; this is the same idea for CSV, with
 * no third-party library needed for a flat, already-tabular structure. */
function escapeCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function streamReportCsv(res: Response, table: ReportTable): void {
  const headerLine = table.columns.map((c) => escapeCell(c.label)).join(",");
  const rowLines = table.rows.map((row) => table.columns.map((c) => escapeCell(row[c.key] ?? "")).join(","));
  const csv = [headerLine, ...rowLines].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${table.title.replace(/[^a-z0-9]+/gi, "_")}.csv"`);
  res.send(csv);
}
