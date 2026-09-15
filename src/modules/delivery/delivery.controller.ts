import type { Request, Response, NextFunction } from "express";
import { DeliveryService } from "./delivery.service.js";

const deliveryService = new DeliveryService();

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

export class DeliveryController {
  async pickup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.pickup(str(req.params.orderId), auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async inTransit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.inTransit(str(req.params.orderId), auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async outForDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.outForDelivery(str(req.params.orderId), auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async deliver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.deliver(str(req.params.orderId), auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async fail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.fail(str(req.params.orderId), req.body, auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async retry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.retry(str(req.params.orderId), req.body, auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async reschedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.reschedule(str(req.params.orderId), req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async startReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.startReturn(str(req.params.orderId), req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async returnProof(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.returnProof(str(req.params.orderId), req.body, auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async confirmReturn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.confirmReturn(str(req.params.orderId), auth(req), meta(req)) });
    } catch (err) { next(err); }
  }

  async confirmPickupReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.confirmPickupReceipt(str(req.params.orderId), req.body, req.auth!.userId, meta(req)) });
    } catch (err) { next(err); }
  }

  async getAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { cursor?: string; pageSize: number } = { pageSize: Number(req.query.pageSize ?? 20) };
      if (typeof req.query.cursor === "string") params.cursor = req.query.cursor;
      res.status(200).json(await deliveryService.getAttempts(str(req.params.orderId), params));
    } catch (err) { next(err); }
  }

  async getTracking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await deliveryService.getTracking(str(req.params.orderId), auth(req)) });
    } catch (err) { next(err); }
  }
}