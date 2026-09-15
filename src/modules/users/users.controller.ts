import type { Request, Response, NextFunction } from "express";
import { UsersService } from "./users.service.js";

const usersService = new UsersService();

function listParams(req: Request) {
  const params: { page: number; pageSize: number; status?: string; role?: string; search?: string } = {
    page: Number(req.query.page ?? 1),
    pageSize: Number(req.query.pageSize ?? 20),
  };
  if (typeof req.query.status === "string") params.status = req.query.status;
  if (typeof req.query.role === "string") params.role = req.query.role;
  if (typeof req.query.search === "string") params.search = req.query.search;
  return params;
}

function stringParam(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing required string parameter");
  }
  return value;
}

function requestMeta(req: Request): { requestId: string; ip?: string } {
  const meta: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) meta.ip = req.ip;
  return meta;
}

export class UsersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.list(listParams(req));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.getById(stringParam(req.params.id));
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.create(req.body, req.auth!.userId, requestMeta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.update(
        stringParam(req.params.id),
        { ...req.body, version: req.version },
        req.auth!.userId,
        requestMeta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async replaceRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.replaceRoles(
        stringParam(req.params.id),
        req.body.roleIds,
        req.auth!.userId,
        requestMeta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}