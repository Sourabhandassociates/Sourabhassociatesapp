import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as causeListService from "./causeList.service";
import { streamCauseListPdf } from "./causeListExport.pdf";
import { writeCauseListWorkbook } from "./causeListExport.excel";

const causeListQuerySchema = z
  .object({
    rangePreset: z.enum(["TODAY", "TOMORROW", "NEXT_7_DAYS", "THIS_WEEK", "CUSTOM"]).default("TODAY"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    courtName: z.string().optional(),
    courtHall: z.string().optional(),
    advocateId: z.string().optional(),
    clientId: z.string().optional(),
    stage: z.string().optional(),
    status: z.enum(["SCHEDULED", "COMPLETED"]).optional(),
    search: z.string().optional(),
    groupBy: z.enum(["NONE", "COURT", "DATE"]).default("NONE"),
    scope: z.enum(["FIRM", "MINE", "EMPLOYEE"]).default("MINE"),
    employeeId: z.string().optional(),
  })
  .refine((d) => d.rangePreset !== "CUSTOM" || (!!d.startDate && !!d.endDate), {
    message: "startDate and endDate are required when rangePreset is CUSTOM",
  })
  .refine((d) => d.scope !== "EMPLOYEE" || !!d.employeeId, {
    message: "employeeId is required when scope is EMPLOYEE",
  });

export async function listCauseList(req: Request, res: Response) {
  const filters = parseBody(causeListQuerySchema, req.query);
  const result = await causeListService.listCauseList(req.actor!, filters);
  res.json(result);
}

export async function exportCauseListPdf(req: Request, res: Response) {
  const filters = parseBody(causeListQuerySchema, req.query);
  const { rows } = await causeListService.listCauseList(req.actor!, filters);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="cause-list.pdf"');
  streamCauseListPdf(res, rows, filters.groupBy);
}

export async function exportCauseListExcel(req: Request, res: Response) {
  const filters = parseBody(causeListQuerySchema, req.query);
  const { rows } = await causeListService.listCauseList(req.actor!, filters);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="cause-list.xlsx"');
  await writeCauseListWorkbook(res, rows, filters.groupBy);
}
