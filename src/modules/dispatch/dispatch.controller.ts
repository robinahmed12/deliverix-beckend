import type { Request, Response, NextFunction } from "express";
import { DispatchService } from "./dispatch.service.js";

const dispatchService = new DispatchService();

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class DispatchController {
  async queue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { cursor?: string; pageSize?: number; zoneId?: string } = {};
      if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
      if (req.query.pageSize !== undefined) params.pageSize = Number(req.query.pageSize);
      if (typeof req.query.zoneId === "string") params.zoneId = req.query.zoneId;
      res.status(200).json(await dispatchService.queue(params));
    } catch (err) { next(err); }
  }

  async workloads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { state?: string } = {};
      if (typeof req.query.state === "string") params.state = req.query.state;
      res.status(200).json(await dispatchService.workloads(params));
    } catch (err) { next(err); }
  }

  async assignmentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await dispatchService.assignmentHistory(str(req.params.orderId)));
    } catch (err) { next(err); }
  }
}