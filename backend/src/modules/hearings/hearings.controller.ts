import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { BadRequestError } from "../../utils/errors";
import * as hearingsService from "./hearings.service";

const scheduleHearingSchema = z.object({
  hearingDate: z.string().datetime(),
  courtName: z.string().optional(),
  courtHall: z.string().optional(),
  judgeName: z.string().optional(),
  purpose: z.string().optional(),
});

export async function scheduleHearing(req: Request, res: Response) {
  const data = parseBody(scheduleHearingSchema, req.body);
  const hearing = await hearingsService.scheduleHearing(req.actor!, req.params.caseId, data);
  res.status(201).json(hearing);
}

export async function listHearingsForCase(req: Request, res: Response) {
  const hearings = await hearingsService.listHearingsForCase(req.actor!, req.params.caseId);
  res.json(hearings);
}

const rescheduleHearingSchema = z.object({
  hearingDate: z.string().datetime(),
  courtName: z.string().optional(),
  courtHall: z.string().optional(),
  judgeName: z.string().optional(),
  purpose: z.string().optional(),
});

export async function rescheduleHearing(req: Request, res: Response) {
  const data = parseBody(rescheduleHearingSchema, req.body);
  const hearing = await hearingsService.rescheduleHearing(req.actor!, req.params.id, data);
  res.json(hearing);
}

const recordOutcomeSchema = z.object({
  outcomeNotes: z.string().optional(),
  nextHearingDate: z.string().datetime().optional(),
});

export async function recordHearingOutcome(req: Request, res: Response) {
  const data = parseBody(recordOutcomeSchema, req.body);
  const result = await hearingsService.recordHearingOutcome(req.actor!, req.params.id, data);
  res.json(result);
}

export async function listHearingsInRange(req: Request, res: Response) {
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  if (!startDate || !endDate) {
    throw new BadRequestError("startDate and endDate query parameters are required");
  }
  const hearings = await hearingsService.listHearingsInRange(req.actor!, startDate, endDate);
  res.json(hearings);
}
