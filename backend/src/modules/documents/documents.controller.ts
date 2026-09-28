import { Request, Response } from "express";
import { z } from "zod";
import { BadRequestError } from "../../utils/errors";
import { parseBody } from "../../utils/validators";
import * as documentsService from "./documents.service";

const createDocumentSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  confidentiality: z.enum(["INTERNAL", "CLIENT_VISIBLE"]).default("INTERNAL"),
});

/** SRD Section 13.1 — upload creates a Document plus its first version (v1). */
export async function uploadDocument(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A file is required");
  const data = parseBody(createDocumentSchema, req.body);

  const document = await documentsService.uploadDocument(req.actor!, req.params.caseId, req.file, data);
  res.status(201).json(document);
}

/** SRD Section 13.1 — every re-upload creates a new version; prior versions retained. */
export async function addVersion(req: Request, res: Response) {
  if (!req.file) throw new BadRequestError("A file is required");

  const version = await documentsService.addVersion(req.actor!, req.params.id, req.file);
  res.status(201).json(version);
}

export async function listDocumentsForCase(req: Request, res: Response) {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  const documents = await documentsService.listDocumentsForCase(req.actor!, req.params.caseId, page, pageSize);
  res.setHeader("X-Total-Count", String(documents.total));
  res.setHeader("X-Page", String(documents.page));
  res.setHeader("X-Page-Size", String(documents.pageSize));
  res.json(documents);
}

export async function getDocument(req: Request, res: Response) {
  const document = await documentsService.getDocument(req.actor!, req.params.id);
  res.json(document);
}

export async function downloadVersion(req: Request, res: Response) {
  const { filePath, fileName } = await documentsService.getDownloadInfo(req.actor!, req.params.versionId);
  res.download(filePath, fileName);
}

export async function deleteDocument(req: Request, res: Response) {
  await documentsService.deleteDocument(req.actor!, req.params.id);
  res.status(204).send();
}
