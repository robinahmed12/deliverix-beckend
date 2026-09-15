import type { Request, Response, NextFunction } from "express";
import { ServiceTypesService } from "./service-types.service.js";

const serviceTypesService = new ServiceTypesService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class ServiceTypesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { active?: boolean; search?: string } = {};
      if (typeof req.query.active === "string") params.active = req.query.active === "true";
      if (typeof req.query.search === "string") params.search = req.query.search;
      res.status(200).json(await serviceTypesService.list(params));
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await serviceTypesService.getById(str(req.params.id)) });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await serviceTypesService.create(req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await serviceTypesService.update(
        str(req.params.id),
        { ...req.body, version: req.version },
        req.auth!.userId,
        meta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }
}