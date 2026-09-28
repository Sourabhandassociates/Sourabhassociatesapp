import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as caseNotesService from "./caseNotes.service";

const addCaseNoteSchema = z.object({
  content: z.string().min(1),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE"]).optional(),
});

export async function addCaseNote(req: Request, res: Response) {
  const data = parseBody(addCaseNoteSchema, req.body);
  const note = await caseNotesService.addCaseNote(req.actor!, req.params.caseId, data);
  res.status(201).json(note);
}

export async function listCaseNotes(req: Request, res: Response) {
  const notes = await caseNotesService.listCaseNotes(req.actor!, req.params.caseId);
  res.json(notes);
}
