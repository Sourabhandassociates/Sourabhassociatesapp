import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { ForbiddenError } from "../../utils/errors";
import * as reportsService from "./reports.service";
import { streamReportPdf } from "./reportsExport.pdf";
import { writeReportWorkbook } from "./reportsExport.excel";

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  format: z.enum(["json", "pdf", "excel"]).optional(),
});

export async function getReport(req: Request, res: Response) {
  const { startDate, endDate, format } = parseBody(querySchema, req.query);

  if (format === "pdf" || format === "excel") {
    if (!req.actor?.effectivePermissions?.has("REPORTS.EXPORT")) {
      throw new ForbiddenError("You do not have permission to export reports");
    }
  }

  const table = await reportsService.generateReport(req.params.type, { startDate, endDate });

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.type}-report.pdf"`);
    return streamReportPdf(res, table);
  }
  if (format === "excel") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.type}-report.xlsx"`);
    return writeReportWorkbook(res, table);
  }
  res.json(table);
}

export async function listReportTypes(_req: Request, res: Response) {
  res.json(reportsService.REPORT_TYPES);
}
