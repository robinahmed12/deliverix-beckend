import type { Request, Response, NextFunction } from "express";
import { ConfigManagementService } from "./config-management.service.js";

const configService = new ConfigManagementService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class ConfigManagementController {
  async listFailureReasons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;
      res.status(200).json(await configService.listFailureReasons(active));
    } catch (err) { next(err); }
  }

  async createFailureReason(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await configService.createFailureReason(req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async updateFailureReason(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await configService.updateFailureReason(str(req.params.id), req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async listProofPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;
      res.status(200).json(await configService.listProofPolicies(active));
    } catch (err) { next(err); }
  }

  async createProofPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await configService.createProofPolicy(req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async activateProofPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await configService.activateProofPolicy(str(req.params.id), req.body.active, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async listSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await configService.listSettings());
    } catch (err) { next(err); }
  }

  async updateSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await configService.updateSetting(str(req.params.key), req.body.value, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }
}