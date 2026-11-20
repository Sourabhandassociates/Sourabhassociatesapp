import { Request, Response, NextFunction } from "express";
import * as clientPortalService from "./clientPortal.service";

export async function getMyProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const profile = await clientPortalService.getMyProfile(req.actor!);
    return res.status(200).json(profile);
  } catch (error) {
    return next(error);
  }
}

export async function listMyCases(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const cases = await clientPortalService.listMyCases(req.actor!);
    return res.status(200).json(cases);
  } catch (error) {
    return next(error);
  }
}

export async function getMyCase(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const caseDetail = await clientPortalService.getMyCase(
      req.actor!,
      req.params.caseId
    );
    return res.status(200).json(caseDetail);
  } catch (error) {
    return next(error);
  }
}

export async function listMyHearings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const caseId =
      typeof req.query.caseId === "string"
        ? req.query.caseId
        : undefined;

    const hearings = await clientPortalService.listMyHearings(
      req.actor!,
      caseId
    );

    return res.status(200).json(hearings);
  } catch (error) {
    return next(error);
  }
}

export async function listMyDocuments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const caseId =
      typeof req.query.caseId === "string"
        ? req.query.caseId
        : undefined;

    const documents = await clientPortalService.listMyDocuments(
      req.actor!,
      caseId
    );

    return res.status(200).json(documents);
  } catch (error) {
    return next(error);
  }
}

export async function downloadMyDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { filePath, fileName } =
      await clientPortalService.getMyDocumentDownload(
        req.actor!,
        req.params.documentId
      );

    return res.download(filePath, fileName);
  } catch (error) {
    return next(error);
  }
}
