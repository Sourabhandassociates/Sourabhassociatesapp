import { Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import * as searchService from "./search.service";

export async function search(req: Request, res: Response) {
  const q = req.query.q;
  if (typeof q !== "string" || !q.trim()) {
    throw new BadRequestError("A search query (q) is required");
  }
  const results = await searchService.globalSearch(req.actor!, q);
  res.json(results);
}

export async function recentSearches(req: Request, res: Response) {
  const recent = await searchService.listRecentSearches(req.actor!);
  res.json(recent);
}
