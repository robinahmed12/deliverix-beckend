import type { Request, Response, NextFunction } from "express";
import { OrdersService } from "./orders.service.js";

const ordersService = new OrdersService();

function auth(req: Request) {
  return { userId: req.auth!.userId, roles: req.auth!.roles };
}

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

function listParams(req: Request) {
  const params: { cursor?: string; pageSize: number; status?: string; customerId?: string; search?: string } = {
    pageSize: Number(req.query.pageSize ?? 20),
  };
  if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
  if (typeof req.query.status === "string") params.status = req.query.status;
  if (typeof req.query.customerId === "string") params.customerId = req.query.customerId;
  if (typeof req.query.search === "string") params.search = req.query.search;
  return params;
}

export class OrdersController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ordersService.create(req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await ordersService.list(listParams(req), auth(req)));
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await ordersService.getById(str(req.params.id), auth(req)) });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ordersService.update(
        str(req.params.id),
        { ...req.body, version: req.version },
        req.auth!.userId,
        meta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async ready(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ordersService.markReady(str(req.params.id), req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ordersService.cancel(str(req.params.id), req.body, req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async history(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await ordersService.getHistory(str(req.params.id), auth(req)) });
    } catch (err) {
      next(err);
    }
  }

  async listNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { cursor?: string; pageSize: number } = { pageSize: Number(req.query.pageSize ?? 20) };
      if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
      res.status(200).json(await ordersService.listNotes(str(req.params.id), params, auth(req)));
    } catch (err) {
      next(err);
    }
  }

  async createNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ordersService.createNote(str(req.params.id), req.body.note, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}