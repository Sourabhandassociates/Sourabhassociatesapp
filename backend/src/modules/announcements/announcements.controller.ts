import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import { ForbiddenError } from "../../utils/errors";
import * as announcementsService from "./announcements.service";

/** Announcements simplification (2026-08-13, direct Managing Partner instruction) —
 * priority/audience/selectedUserIds/startDate/expiryDate are no longer accepted from
 * the client at all: every announcement is now unconditionally visible to every firm
 * user (server-enforced in the service layer, not just "the UI doesn't ask"), and the
 * 24-hour Dashboard auto-expiry (Section 24/29, v1.20) already works purely off
 * `createdAt` — it never needed an explicit Expiry Date to function. */
const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export async function createAnnouncement(req: Request, res: Response) {
  const data = parseBody(createSchema, req.body);
  const announcement = await announcementsService.createAnnouncement(req.actor!, data);
  res.status(201).json(announcement);
}

export async function listAnnouncements(req: Request, res: Response) {
  const announcements = await announcementsService.listAnnouncements(req.actor!);
  res.json(announcements);
}

export async function getAnnouncement(req: Request, res: Response) {
  const announcement = await announcementsService.getAnnouncementById(req.actor!, req.params.id);
  res.json(announcement);
}

export async function markAnnouncementRead(req: Request, res: Response) {
  await announcementsService.markAnnouncementRead(req.actor!, req.params.id);
  res.status(204).send();
}

export async function getReadTracking(req: Request, res: Response) {
  const tracking = await announcementsService.getAnnouncementReadTracking(req.actor!, req.params.id);
  res.json(tracking);
}

const setActiveSchema = z.object({ isActive: z.boolean() });

export async function setAnnouncementActive(req: Request, res: Response) {
  if (req.actor!.role !== "MANAGING_PARTNER") {
    throw new ForbiddenError("Only the Managing Partner can publish/archive an announcement");
  }
  const data = parseBody(setActiveSchema, req.body);
  const announcement = await announcementsService.setAnnouncementActive(req.actor!, req.params.id, data.isActive);
  res.json(announcement);
}
