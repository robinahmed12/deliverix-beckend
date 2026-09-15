import type { Request, Response, NextFunction } from "express";
import { VehiclesService } from "./vehicles.service.js";

const vehiclesService = new VehiclesService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class VehiclesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { page: number; pageSize: number; status?: string; search?: string } = {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
      };
      if (typeof req.query.status === "string") params.status = req.query.status;
      if (typeof req.query.search === "string") params.search = req.query.search;
      res.status(200).json(await vehiclesService.list(params));
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await vehiclesService.getById(str(req.params.id)) });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await vehiclesService.create(req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await vehiclesService.update(str(req.params.id), { ...req.body, version: req.version }, req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async allocate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await vehiclesService.allocate(str(req.params.id), str(req.body.driverId), req.body.reasonCode ?? null, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async deallocate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const driverId = typeof req.body.driverId === "string" ? req.body.driverId : undefined;
      const result = await vehiclesService.deallocate(str(req.params.id), driverId, req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }
}