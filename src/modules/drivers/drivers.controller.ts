import type { Request, Response, NextFunction } from "express";
import { DriversService } from "./drivers.service.js";

const driversService = new DriversService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class DriversController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { page: number; pageSize: number; state?: string; active?: boolean; search?: string } = {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
      };
      if (typeof req.query.state === "string") params.state = req.query.state;
      if (typeof req.query.active === "string") params.active = req.query.active === "true";
      if (typeof req.query.search === "string") params.search = req.query.search;
      res.status(200).json(await driversService.list(params));
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await driversService.getById(str(req.params.id)) });
    } catch (err) { next(err); }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await driversService.getByAccountId(req.auth!.userId) });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await driversService.create(req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await driversService.update(
        str(req.params.id),
        { ...req.body, version: req.version },
        req.auth!.userId,
        meta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async setAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await driversService.getByAccountId(req.auth!.userId);
      const result = await driversService.setAvailability(profile.id, req.body.state, req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async myAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await driversService.getByAccountId(req.auth!.userId);
      res.status(200).json({ data: await driversService.listAssignments(profile.id) });
    } catch (err) { next(err); }
  }
}