import type { Request, Response, NextFunction } from "express";
import { CustomersService } from "./customers.service.js";

const customersService = new CustomersService();

function listParams(req: Request) {
  const params: { page: number; pageSize: number; search?: string; status?: string } = {
    page: Number(req.query.page ?? 1),
    pageSize: Number(req.query.pageSize ?? 20),
  };
  if (typeof req.query.search === "string") params.search = req.query.search;
  if (typeof req.query.status === "string") params.status = req.query.status;
  return params;
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

export class CustomersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await customersService.list(listParams(req)));
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await customersService.getById(str(req.params.id)) });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customersService.create(req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customersService.update(
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

  async listAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await customersService.listAddresses(str(req.params.id)) });
    } catch (err) {
      next(err);
    }
  }

  async createAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customersService.createAddress(str(req.params.id), req.body, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customersService.updateAddress(
        str(req.params.id),
        str(req.params.addressId),
        req.body,
        req.auth!.userId,
        meta(req),
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async deleteAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await customersService.deleteAddress(
        str(req.params.id),
        str(req.params.addressId),
        req.auth!.userId,
        meta(req),
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}