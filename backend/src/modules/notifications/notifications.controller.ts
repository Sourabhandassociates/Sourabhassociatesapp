import { Request, Response } from "express";
import * as notificationsService from "./notifications.service";

export async function listNotifications(req: Request, res: Response) {
  const unreadOnly = req.query.unreadOnly === "true";
  const notifications = await notificationsService.listNotifications(req.actor!, unreadOnly);
  res.json(notifications);
}

export async function unreadCount(req: Request, res: Response) {
  const count = await notificationsService.unreadCount(req.actor!);
  res.json({ count });
}

export async function markRead(req: Request, res: Response) {
  await notificationsService.markRead(req.actor!, req.params.id);
  res.status(204).send();
}

export async function markAllRead(req: Request, res: Response) {
  await notificationsService.markAllRead(req.actor!);
  res.status(204).send();
}
