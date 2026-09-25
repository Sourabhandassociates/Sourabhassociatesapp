import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { getFirmQrCodePath } from "../firmProfile/firmProfile.service";

/** S&A LEGAL brand blue — same swatch as causeListExport.pdf.ts's BRAND_COLOR. */
const BRAND_COLOR = "#0938c4";
const MUTED_COLOR = "#555555";
const BORDER_COLOR = "#d5d9e0";

const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "logo.png");
const MARGIN = 44;

interface InvoiceLineItemLike {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PaymentLike {
  amount: number;
  paidAt: Date;
  method: string | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  termsAndConditions: string | null;
  lineItems: InvoiceLineItemLike[];
  payments: PaymentLike[];
  client: { name: string; clientId: string; email: string | null; phone: string | null; address: string | null };
  // New Case form simplification (2026-08-11) — title/practiceArea are now optional.
  case: { matterNumber: string; title: string | null; courtName: string | null; practiceArea: string | null } | null;
}

export interface FirmProfilePdfData {
  firmName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  pan: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
}

function money(n: number): string {
  return `Rs. ${n.toFixed(2)}`;
}

const ITEM_COLUMNS = [
  { label: "Description", width: 235, align: "left" as const },
  { label: "Qty", width: 45, align: "right" as const },
  { label: "Rate", width: 90, align: "right" as const },
  { label: "Amount", width: 105, align: "right" as const },
];

function renderItemsHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff");
  doc.rect(MARGIN, y, ITEM_COLUMNS.reduce((s, c) => s + c.width, 0), 20).fill(BRAND_COLOR);
  let x = MARGIN;
  for (const col of ITEM_COLUMNS) {
    doc.fillColor("#fff").text(col.label, x + 6, y + 6, { width: col.width - 10, align: col.align });
    x += col.width;
  }
  doc.fillColor("#000").font("Helvetica");
  return y + 20;
}

function renderItemRow(doc: PDFKit.PDFDocument, item: InvoiceLineItemLike, y: number, shaded: boolean): number {
  doc.fontSize(9);
  const tableWidth = ITEM_COLUMNS.reduce((s, c) => s + c.width, 0);
  const descHeight = doc.heightOfString(item.description, { width: ITEM_COLUMNS[0].width - 10 });
  const rowHeight = Math.max(descHeight + 10, 22);
  if (shaded) {
    doc.rect(MARGIN, y, tableWidth, rowHeight).fill("#f5f7fb");
    doc.fillColor("#000");
  }
  let x = MARGIN;
  doc.text(item.description, x + 6, y + 6, { width: ITEM_COLUMNS[0].width - 10 });
  x += ITEM_COLUMNS[0].width;
  doc.text(String(item.quantity), x + 6, y + 6, { width: ITEM_COLUMNS[1].width - 10, align: "right" });
  x += ITEM_COLUMNS[1].width;
  doc.text(money(item.rate), x + 6, y + 6, { width: ITEM_COLUMNS[2].width - 10, align: "right" });
  x += ITEM_COLUMNS[2].width;
  doc.text(money(item.amount), x + 6, y + 6, { width: ITEM_COLUMNS[3].width - 10, align: "right" });
  return y + rowHeight;
}

function summaryLine(doc: PDFKit.PDFDocument, label: string, value: string, y: number, opts?: { bold?: boolean; color?: string }): number {
  const width = ITEM_COLUMNS.reduce((s, c) => s + c.width, 0);
  const labelWidth = width - 105;
  doc
    .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.bold ? 10 : 9)
    .fillColor(opts?.color ?? "#000")
    .text(label, MARGIN + labelWidth - 120, y, { width: 120, align: "right" })
    .text(value, MARGIN + labelWidth, y, { width: 105, align: "right" });
  doc.fillColor("#000").font("Helvetica").fontSize(9);
  return y + 16;
}

/**
 * Renders a client-facing invoice PDF and streams it to `res`. Firm/bank/UPI
 * details are read live from `FirmProfile` by the caller and passed in — never
 * copied onto the Invoice row — so a later Billing Settings change is reflected on
 * every invoice generated afterward (see FirmProfile's schema doc comment). The
 * "Scan to Pay" image, if any, is the firm's own uploaded QR code
 * (`FirmProfile`'s payment-qr.png/.jpg, resolved via `getFirmQrCodePath`) — not a
 * QR code generated from the UPI ID — since the firm's real bank-issued QR is the
 * one clients should actually scan; the section is simply omitted when none has
 * been uploaded yet.
 */
export function streamInvoicePdf(res: Response, invoice: InvoicePdfData, firm: FirmProfilePdfData): void {
  const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
  doc.pipe(res);

  // --- Header: logo (left) + firm name/details, vertically centered against it;
  // "INVOICE" heading + meta (right), centered against the same row. ---
  const LOGO_HEIGHT = 46;
  const LOGO_SLOT_WIDTH = 64;
  const firmBlockX = MARGIN + LOGO_SLOT_WIDTH;
  const firmBlockWidth = 250;
  const rightBlockWidth = 200;
  const rightBlockX = doc.page.width - MARGIN - rightBlockWidth;

  doc.font("Helvetica-Bold").fontSize(16);
  const firmName = firm.firmName || "S&A LEGAL";
  const firmNameHeight = doc.heightOfString(firmName, { width: firmBlockWidth });
  const firmLines = [firm.address, [firm.phone, firm.email].filter(Boolean).join("  |  "), firm.website].filter(Boolean) as string[];
  const firmLinesText = firmLines.join("\n");
  doc.font("Helvetica").fontSize(8.5);
  const firmLinesHeight = firmLines.length ? doc.heightOfString(firmLinesText, { width: firmBlockWidth }) : 0;
  const firmTextGap = firmLines.length ? 4 : 0;
  const firmTextTotalHeight = firmNameHeight + firmTextGap + firmLinesHeight;

  doc.font("Helvetica-Bold").fontSize(20);
  const invoiceHeadingHeight = doc.heightOfString("INVOICE", { width: rightBlockWidth });
  const metaLines = [
    `Invoice #: ${invoice.invoiceNumber}`,
    `Issue Date: ${invoice.issueDate.toLocaleDateString()}`,
    `Due Date: ${invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "-"}`,
  ];
  const metaText = metaLines.join("\n");
  doc.font("Helvetica").fontSize(9);
  const metaHeight = doc.heightOfString(metaText, { width: rightBlockWidth });
  const rightTextTotalHeight = invoiceHeadingHeight + 6 + metaHeight;

  const headerRowHeight = Math.max(LOGO_HEIGHT, firmTextTotalHeight, rightTextTotalHeight);

  if (fs.existsSync(LOGO_PATH)) {
    const logoY = MARGIN + (headerRowHeight - LOGO_HEIGHT) / 2;
    doc.image(LOGO_PATH, MARGIN, logoY, { height: LOGO_HEIGHT });
  }

  const firmTextY = MARGIN + (headerRowHeight - firmTextTotalHeight) / 2;
  doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND_COLOR).text(firmName, firmBlockX, firmTextY, { width: firmBlockWidth });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(MUTED_COLOR)
    .text(firmLinesText, firmBlockX, firmTextY + firmNameHeight + firmTextGap, { width: firmBlockWidth });

  const rightTextY = MARGIN + (headerRowHeight - rightTextTotalHeight) / 2;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND_COLOR).text("INVOICE", rightBlockX, rightTextY, { width: rightBlockWidth, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#000")
    .text(metaText, rightBlockX, rightTextY + invoiceHeadingHeight + 6, { width: rightBlockWidth, align: "right" });

  doc.y = MARGIN + headerRowHeight + 16;
  doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor(BRAND_COLOR).lineWidth(1.2).stroke();
  doc.lineWidth(1);
  doc.moveDown(1.2);
  doc.fillColor("#000");

  // --- Client / Matter details ---
  const detailsTop = doc.y;
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor(BRAND_COLOR).text("Bill To", MARGIN, detailsTop);
  doc.font("Helvetica").fillColor("#000").fontSize(9);
  const clientLines = [invoice.client.name, invoice.client.address, [invoice.client.phone, invoice.client.email].filter(Boolean).join("  |  ")].filter(
    Boolean
  ) as string[];
  doc.text(clientLines.join("\n"), MARGIN, detailsTop + 15, { width: 250 });

  const matterX = MARGIN + 280;
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor(BRAND_COLOR).text("Matter Details", matterX, detailsTop);
  doc.font("Helvetica").fillColor("#000").fontSize(9);
  // New Case form simplification (2026-08-11) — Case.title/practiceArea are now
  // optional; the matter-number-only line and `.filter(Boolean)` below already
  // drop a blank practiceArea cleanly, `.title` just needs the same conditional
  // treatment so a blank title never leaks a literal "— null"/"— " into the PDF.
  const matterLines = invoice.case
    ? [
        invoice.case.title ? `${invoice.case.matterNumber} — ${invoice.case.title}` : invoice.case.matterNumber,
        invoice.case.practiceArea,
        invoice.case.courtName ?? undefined,
      ].filter(Boolean)
    : ["General Invoice (not tied to a specific matter)"];
  doc.text((matterLines as string[]).join("\n"), matterX, detailsTop + 15, { width: 235 });

  doc.y = Math.max(doc.y, detailsTop + 62);
  doc.moveDown(1.2);

  // --- Line items table ---
  let y = renderItemsHeader(doc, doc.y);
  const pageBottom = doc.page.height - MARGIN - 140;
  invoice.lineItems.forEach((item, index) => {
    if (y > pageBottom) {
      doc.addPage();
      y = MARGIN;
      y = renderItemsHeader(doc, y);
    }
    y = renderItemRow(doc, item, y, index % 2 === 1);
  });
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + ITEM_COLUMNS.reduce((s, c) => s + c.width, 0), y)
    .strokeColor(BORDER_COLOR)
    .stroke();
  doc.y = y + 14;

  if (doc.y > doc.page.height - MARGIN - 160) {
    doc.addPage();
  }

  // --- Totals ---
  let sy = doc.y;
  sy = summaryLine(doc, "Subtotal", money(invoice.subtotal), sy);
  if (invoice.discountAmount > 0) {
    const discountLabel = invoice.discountType === "PERCENTAGE" ? `Discount (${invoice.discountValue}%)` : "Discount";
    sy = summaryLine(doc, discountLabel, `- ${money(invoice.discountAmount)}`, sy);
  }
  if (invoice.taxAmount > 0) {
    // GST breakup — a single combined rate is captured at creation time (no
    // inter-state/IGST detection data on this schema), shown as a CGST/SGST 50/50
    // split beneath the combined line, the common intra-state Indian invoice
    // convention, rather than inventing state-of-supply logic this app has no data
    // to support.
    sy = summaryLine(doc, `GST (${invoice.taxRate}%)`, money(invoice.taxAmount), sy, { bold: true });
    sy = summaryLine(doc, `  CGST (${(invoice.taxRate / 2).toFixed(2)}%)`, money(invoice.taxAmount / 2), sy, { color: MUTED_COLOR });
    sy = summaryLine(doc, `  SGST (${(invoice.taxRate / 2).toFixed(2)}%)`, money(invoice.taxAmount / 2), sy, { color: MUTED_COLOR });
  }
  sy += 2;
  doc
    .moveTo(MARGIN + 130, sy)
    .lineTo(MARGIN + ITEM_COLUMNS.reduce((s, c) => s + c.width, 0), sy)
    .strokeColor(BORDER_COLOR)
    .stroke();
  sy += 6;
  sy = summaryLine(doc, "Grand Total", money(invoice.total), sy, { bold: true });
  const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  sy = summaryLine(doc, "Amount Paid", money(amountPaid), sy);
  sy = summaryLine(doc, "Balance Due", money(invoice.total - amountPaid), sy, { bold: true, color: BRAND_COLOR });
  doc.y = sy + 12;

  // --- Notes / Terms ---
  if (invoice.notes) {
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(BRAND_COLOR).text("Notes", MARGIN, doc.y);
    doc.font("Helvetica").fillColor("#000").fontSize(9).text(invoice.notes, MARGIN, doc.y + 13, { width: doc.page.width - MARGIN * 2 });
    doc.moveDown(0.9);
  }
  if (invoice.termsAndConditions) {
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(BRAND_COLOR).text("Terms & Conditions", MARGIN, doc.y);
    doc
      .font("Helvetica")
      .fillColor("#000")
      .fontSize(9)
      .text(invoice.termsAndConditions, MARGIN, doc.y + 13, { width: doc.page.width - MARGIN * 2 });
    doc.moveDown(0.9);
  }

  // --- Payment section ---
  const hasBankDetails = firm.bankName || firm.accountNumber;
  const qrCodePath = getFirmQrCodePath();
  if (hasBankDetails || qrCodePath) {
    if (doc.y > doc.page.height - MARGIN - 150) {
      doc.addPage();
    }
    doc.moveDown(0.5);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(doc.page.width - MARGIN, doc.y)
      .strokeColor(BORDER_COLOR)
      .stroke();
    doc.moveDown(0.7);

    const paymentTop = doc.y;
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor(BRAND_COLOR).text("Payment Details", MARGIN, paymentTop);
    doc.font("Helvetica").fillColor("#000").fontSize(9);
    const bankLines = [
      firm.bankName ? `Bank Name: ${firm.bankName}` : null,
      firm.accountHolderName ? `Account Name: ${firm.accountHolderName}` : null,
      firm.accountNumber ? `Account Number: ${firm.accountNumber}` : null,
      firm.ifsc ? `IFSC Code: ${firm.ifsc}` : null,
      firm.branch ? `Branch: ${firm.branch}` : null,
    ].filter(Boolean) as string[];
    doc.text(bankLines.join("\n"), MARGIN, paymentTop + 15, { width: 320 });

    if (qrCodePath) {
      const qrX = doc.page.width - MARGIN - 110;
      doc.image(qrCodePath, qrX, paymentTop + 15, { width: 110, height: 110 });
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(MUTED_COLOR)
        .text("Scan to Pay", qrX, paymentTop + 129, { width: 110, align: "center" });
      doc.fillColor("#000");
    }
    doc.y = Math.max(doc.y, paymentTop + (qrCodePath ? 150 : bankLines.length * 12 + 20));
  }

  doc.moveDown(1.2);
  doc.fontSize(8).font("Helvetica").fillColor(MUTED_COLOR).text("This is a system-generated invoice.", MARGIN, doc.y, { align: "center" });

  doc.end();
}
