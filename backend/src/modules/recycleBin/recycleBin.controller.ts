import { Request, Response } from "express";
import * as recycleBinService from "./recycleBin.service";

export async function listDeletedRecords(_req: Request, res: Response) {
  const entries = await recycleBinService.listDeletedRecords();
  res.json(entries);
}

export async function restoreRecord(req: Request, res: Response) {
  await recycleBinService.restoreRecord(req.actor!, req.params.entityType, req.params.id);
  res.status(204).send();
}

export async function permanentlyDeleteRecord(req: Request, res: Response) {
  await recycleBinService.permanentlyDeleteRecord(req.actor!, req.params.entityType, req.params.id);
  res.status(204).send();
}
