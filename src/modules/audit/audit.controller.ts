import type { Request, Response, NextFunction } from "express";
import { AuditService } from "./audit.service.js";

const auditService = new AuditService();

export class AuditController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: {
        cursor?: string;
        pageSize: number;
        from?: Date;
        to?: Date;
        actorId?: string;
        action?: string;
        resourceType?: string;
        resourceId?: string;
      } = { pageSize: Number(req.query.pageSize ?? 20) };
      if (typeof req.query.cursor === "string" && req.query.cursor.length > 0) params.cursor = req.query.cursor;
      if (typeof req.query.from === "string") {
        const d = new Date(req.query.from);
        if (!Number.isNaN(d.getTime())) params.from = d;
      }
      if (typeof req.query.to === "string") {
        const d = new Date(req.query.to);
        if (!Number.isNaN(d.getTime())) params.to = d;
      }
      if (typeof req.query.actorId === "string" && req.query.actorId.length > 0) params.actorId = req.query.actorId;
      if (typeof req.query.action === "string" && req.query.action.length > 0) params.action = req.query.action;
      if (typeof req.query.resourceType === "string" && req.query.resourceType.length > 0) params.resourceType = req.query.resourceType;
      if (typeof req.query.resourceId === "string" && req.query.resourceId.length > 0) params.resourceId = req.query.resourceId;
      res.status(200).json(await auditService.list(params));
    } catch (err) {
      next(err);
    }
  }
}