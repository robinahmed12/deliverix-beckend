import type { Request, Response, NextFunction } from "express";
import { ProofService } from "./proof.service.js";

const proofService = new ProofService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

const auth = (req: Request) => ({ userId: req.auth!.userId, roles: req.auth!.roles });

export class ProofController {
  async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await proofService.submitProof(str(req.params.orderId), req.body, auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { cursor?: string; pageSize: number } = { pageSize: Number(req.query.pageSize ?? 20) };
      if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
      res.status(200).json(await proofService.listProofs(str(req.params.orderId), params, auth(req)));
    } catch (err) { next(err); }
  }

  async generateOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await proofService.generateOtpChallenge(str(req.params.orderId), "ProofOfDelivery", auth(req), meta(req)) });
    } catch (err) { next(err); }
  }
}