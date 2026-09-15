import type { Request, Response, NextFunction } from "express";
import { NotificationsService } from "./notifications.service.js";

const notificationsService = new NotificationsService();

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class NotificationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { cursor?: string; pageSize: number; unreadOnly?: boolean } = {
        pageSize: Number(req.query.pageSize ?? 20),
      };
      if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
      if (typeof req.query.unreadOnly === "string") params.unreadOnly = req.query.unreadOnly === "true";
      res.status(200).json(await notificationsService.list(params, req.auth!.userId));
    } catch (err) { next(err); }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await notificationsService.markRead(str(req.params.id), req.auth!.userId) });
    } catch (err) { next(err); }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await notificationsService.markAllRead(req.auth!.userId) });
    } catch (err) { next(err); }
  }
}