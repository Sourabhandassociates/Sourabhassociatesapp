import ExcelJS from "exceljs";
import { Response } from "express";
import { ReportTable } from "./reports.service";

const BRAND_COLOR = "FF0938C4"; // exceljs ARGB format

/** Generic tabular Excel renderer shared by every report type — see
 * reportsExport.pdf.ts's matching generic PDF renderer for the same rationale. */
export async function writeReportWorkbook(res: Response, table: ReportTable) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "S&A LEGAL";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(table.title.slice(0, 31));
  sheet.columns = table.columns.map((c) => ({ header: c.label, key: c.key, width: 22 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_COLOR } };

  for (const row of table.rows) {
    sheet.addRow(row);
  }

  await workbook.xlsx.write(res);
  res.end();
}
