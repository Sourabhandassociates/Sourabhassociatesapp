import ExcelJS from "exceljs";
import { Response } from "express";
import { CauseListGroupBy, CauseListRow, groupRows } from "./causeList.service";

/** S&A LEGAL brand blue — matches frontend/src/index.css's --color-primary,
 * extracted programmatically from the firm's brand-guide PDF (its own
 * labeled swatch: CMYK 94/76/0/0, RGB 9/56/196, HEX #0938C4). */
const BRAND_COLOR = "FF0938C4"; // exceljs ARGB format

/** Renders the Cause List as an .xlsx workbook, grouped identically to the on-screen
 * table (see causeList.service.ts's groupRows, reused server-side here). Streams
 * directly to the response via exceljs's own streaming writer. */
export async function writeCauseListWorkbook(res: Response, rows: CauseListRow[], groupBy: CauseListGroupBy) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "S&A LEGAL";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Cause List");
  sheet.columns = [
    { header: "Case Number", key: "matterNumber", width: 16 },
    { header: "Cause Title", key: "causeTitle", width: 30 },
    { header: "Client(s)", key: "clientNames", width: 24 },
    { header: "Court", key: "courtName", width: 18 },
    { header: "Court Hall / No.", key: "courtHall", width: 14 },
    { header: "Hearing Date/Time", key: "hearingDate", width: 20 },
    { header: "Hearing Purpose", key: "hearingPurpose", width: 20 },
    { header: "Case Stage", key: "caseStage", width: 16 },
    { header: "Advocate(s)", key: "advocates", width: 24 },
    { header: "Hearing Status", key: "hearingStatus", width: 14 },
    { header: "Next Hearing Date", key: "nextHearingDate", width: 18 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_COLOR } };

  const groups = groupRows(rows, groupBy);
  for (const group of groups) {
    if (group.label) {
      const groupRow = sheet.addRow([group.label]);
      groupRow.font = { bold: true, italic: true, color: { argb: BRAND_COLOR } };
      groupRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F5FC" } };
      sheet.mergeCells(groupRow.number, 1, groupRow.number, 11);
    }
    for (const r of group.rows) {
      sheet.addRow({
        matterNumber: r.matterNumber,
        causeTitle: r.causeTitle,
        clientNames: r.clientNames.join(", "),
        courtName: r.courtName ?? "",
        courtHall: r.courtHall ?? "",
        hearingDate: new Date(r.hearingDate).toLocaleString(),
        hearingPurpose: r.hearingPurpose ?? "",
        caseStage: r.caseStage ?? "",
        advocates: r.advocates.map((a) => a.name).join(", "),
        hearingStatus: r.hearingStatus,
        nextHearingDate: r.nextHearingDate ? new Date(r.nextHearingDate).toLocaleDateString() : "",
      });
    }
  }

  await workbook.xlsx.write(res);
  res.end();
}
