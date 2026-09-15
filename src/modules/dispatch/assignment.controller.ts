import type { Request, Response, NextFunction } from "express";
import { AssignmentService } from "./assignment.service.js";

const assignmentService = new AssignmentService();

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

export class AssignmentController {
  async createForOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = str(req.params.orderId);
      const { driverId } = req.body as { driverId: string };
      const offerExpiresAt: Date | null = req.body.offerExpiresAt ? new Date(req.body.offerExpiresAt) : null;
      const result = await assignmentService.createOffer(orderId, driverId, offerExpiresAt, req.auth!.userId, meta(req));
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await assignmentService.accept(str(req.params.id), { userId: req.auth!.userId, roles: req.auth!.roles });
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await assignmentService.reject(str(req.params.id), { userId: req.auth!.userId, roles: req.auth!.roles });
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async withdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reasonCode = typeof req.body.reasonCode === "string" ? req.body.reasonCode : null;
      const reasonText = typeof req.body.reasonText === "string" ? req.body.reasonText : null;
      const result = await assignmentService.withdraw(str(req.params.id), req.auth!.userId, reasonCode, reasonText, meta(req));
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }

  async reassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = str(req.params.orderId);
      const { driverId, reasonCode } = req.body as { driverId: string; reasonCode: string };
      const reasonText: string | null = req.body.reasonText ?? null;
      const offerExpiresAt: Date | null = req.body.offerExpiresAt ? new Date(req.body.offerExpiresAt) : null;
      const result = await assignmentService.reassign(orderId, driverId, reasonCode, reasonText, offerExpiresAt, req.auth!.userId, meta(req));
      res.status(200).json({ data: result });
    } catch (err) { next(err); }
  }
}