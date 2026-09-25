import { Request, Response } from "express";
import * as clientPortalService from "./clientPortal.service";

export async function getMyProfile(req: Request, res: Response) {
  const profile = await clientPortalService.getMyProfile(req.actor!);
  res.json(profile);
}

export async function listMyCases(req: Request, res: Response) {
  const cases = await clientPortalService.listMyCases(req.actor!);
  res.json(cases);
}

export async function getMyCase(req: Request, res: Response) {
  const caseDetail = await clientPortalService.getMyCase(req.actor!, req.params.caseId);
  res.json(caseDetail);
}

export async function listMyHearings(req: Request, res: Response) {
  const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
  const hearings = await clientPortalService.listMyHearings(req.actor!, caseId);
  res.json(hearings);
}

export async function listMyDocuments(req: Request, res: Response) {
  const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
  const documents = await clientPortalService.listMyDocuments(req.actor!, caseId);
  res.json(documents);
}

export async function downloadMyDocument(req: Request, res: Response) {
  const { filePath, fileName } = await clientPortalService.getMyDocumentDownload(req.actor!, req.params.documentId);
  res.download(filePath, fileName);
}
