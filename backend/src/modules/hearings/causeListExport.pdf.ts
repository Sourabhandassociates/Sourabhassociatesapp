import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { CauseListGroupBy, CauseListRow, groupRows } from "./causeList.service";

/** S&A LEGAL brand blue — matches frontend/src/index.css's --color-primary,
 * extracted programmatically from the firm's brand-guide PDF (its own
 * labeled swatch: CMYK 94/76/0/0, RGB 9/56/196, HEX #0938C4). */
const BRAND_COLOR = "#0938c4";

/** Populated once the Managing Partner supplies the logo file at
 * frontend/public/logo.png (copied here so the PDF exporter doesn't depend on
 * the frontend build); a missing file is handled gracefully, not a crash. */
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "logo.png");

const COLUMNS: { label: string; width: number; get: (r: CauseListRow) => string }[] = [
  { label: "Case No.", width: 70, get: (r) => r.matterNumber },
  { label: "Cause Title", width: 120, get: (r) => r.causeTitle },
  { label: "Client(s)", width: 90, get: (r) => r.clientNames.join(", ") },
  { label: "Court", width: 80, get: (r) => r.courtName ?? "" },
  { label: "Hall/No.", width: 55, get: (r) => r.courtHall ?? "" },
  { label: "Time", width: 60, get: (r) => new Date(r.hearingDate).toLocaleString() },
  { label: "Purpose", width: 80, get: (r) => r.hearingPurpose ?? "" },
  { label: "Stage", width: 60, get: (r) => r.caseStage ?? "" },
  { label: "Advocate(s)", width: 90, get: (r) => r.advocates.map((a) => a.name).join(", ") },
  { label: "Status", width: 55, get: (r) => r.hearingStatus },
  { label: "Next Hearing", width: 70, get: (r) => (r.nextHearingDate ? new Date(r.nextHearingDate).toLocaleDateString() : "") },
];

const MARGIN = 36;

function renderTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.fontSize(8).font("Helvetica-Bold");
  let x = MARGIN;
  for (const col of COLUMNS) {
    doc.text(col.label, x, y, { width: col.width, ellipsis: true });
    x += col.width;
  }
  doc.font("Helvetica");
  return y + 14;
}

function renderRow(doc: PDFKit.PDFDocument, row: CauseListRow, y: number): number {
  doc.fontSize(7.5);
  let x = MARGIN;
  let maxHeight = 10;
  for (const col of COLUMNS) {
    const text = col.get(row);
    const height = doc.heightOfString(text, { width: col.width });
    maxHeight = Math.max(maxHeight, height);
    doc.text(text, x, y, { width: col.width, ellipsis: true });
    x += col.width;
  }
  return y + maxHeight + 4;
}

/** Renders the Cause List as a landscape PDF, grouped identically to the on-screen
 * table (see causeList.service.ts's groupRows, reused server-side here). Streams
 * directly to the response — pdfkit's PDFDocument is itself a Readable stream. */
export function streamCauseListPdf(res: Response, rows: CauseListRow[], groupBy: CauseListGroupBy): void {
  const doc = new PDFDocument({ margin: MARGIN, layout: "landscape", size: "A4" });
  doc.pipe(res);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, MARGIN, MARGIN, { height: 28 });
  }
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor(BRAND_COLOR)
    .text("S&A LEGAL — Cause List", { align: "center" });
  doc.fontSize(9).font("Helvetica").fillColor("#555").text(`Generated ${new Date().toLocaleString()}`, {
    align: "center",
  });
  doc.fillColor("#000");
  doc.moveDown();

  const groups = groupRows(rows, groupBy);
  const pageBottom = doc.page.height - MARGIN;

  for (const group of groups) {
    if (group.label) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor(BRAND_COLOR).text(group.label);
      doc.font("Helvetica").fillColor("#000");
    }
    let y = doc.y + 4;
    y = renderTableHeader(doc, y);
    for (const row of group.rows) {
      if (y > pageBottom - 20) {
        doc.addPage();
        y = MARGIN;
        y = renderTableHeader(doc, y);
      }
      y = renderRow(doc, row, y);
    }
    doc.y = y + 10;
  }

  if (rows.length === 0) {
    doc.fontSize(10).text("No hearings match the selected filters.");
  }

  doc.end();
}
