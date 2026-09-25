import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { ReportTable } from "./reports.service";

const BRAND_COLOR = "#0938c4";
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "logo.png");
const MARGIN = 36;

/** Generic tabular PDF renderer shared by every report type (reports.service.ts's
 * `ReportTable`) — the columns/rows differ per report, but the rendering logic (header,
 * pagination, brand styling) is identical, matching the Cause List exporter's shape
 * (causeListExport.pdf.ts) one level more generic. */
export function streamReportPdf(res: Response, table: ReportTable): void {
  const doc = new PDFDocument({ margin: MARGIN, layout: "landscape", size: "A4" });
  doc.pipe(res);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, MARGIN, MARGIN, { height: 28 });
  }
  doc.fontSize(16).font("Helvetica-Bold").fillColor(BRAND_COLOR).text(`S&A LEGAL — ${table.title}`, { align: "center" });
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#555")
    .text(`Generated ${new Date(table.generatedAt).toLocaleString()}`, { align: "center" });
  doc.fillColor("#000");
  doc.moveDown();

  const pageWidth = doc.page.width - MARGIN * 2;
  const colWidth = pageWidth / table.columns.length;
  const pageBottom = doc.page.height - MARGIN;

  function renderHeader(y: number): number {
    doc.fontSize(9).font("Helvetica-Bold");
    let x = MARGIN;
    for (const col of table.columns) {
      doc.text(col.label, x, y, { width: colWidth, ellipsis: true });
      x += colWidth;
    }
    doc.font("Helvetica");
    return y + 16;
  }

  let y = doc.y + 4;
  y = renderHeader(y);

  for (const row of table.rows) {
    if (y > pageBottom - 20) {
      doc.addPage();
      y = MARGIN;
      y = renderHeader(y);
    }
    doc.fontSize(8.5);
    let x = MARGIN;
    let maxHeight = 12;
    for (const col of table.columns) {
      const text = String(row[col.key] ?? "");
      const height = doc.heightOfString(text, { width: colWidth });
      maxHeight = Math.max(maxHeight, height);
      doc.text(text, x, y, { width: colWidth, ellipsis: true });
      x += colWidth;
    }
    y += maxHeight + 4;
  }

  if (table.rows.length === 0) {
    doc.fontSize(10).text("No data matches the selected filters.");
  }

  doc.end();
}
