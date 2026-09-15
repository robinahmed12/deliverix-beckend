import type { Request, Response, NextFunction } from "express";
import { ReportsService } from "./reports.service.js";

const reportsService = new ReportsService();

export class ReportsController {
  async dashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { date?: string; timezone?: string } = {};
      if (typeof req.query.date === "string" && req.query.date.length > 0) params.date = req.query.date;
      if (typeof req.query.timezone === "string" && req.query.timezone.length > 0) params.timezone = req.query.timezone;
      res.status(200).json(await reportsService.dashboard(params));
    } catch (err) {
      next(err);
    }
  }

  async deliveries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: {
        from: Date;
        to: Date;
        zoneId?: string;
        status?: string;
        customerId?: string;
        timezone?: string;
      } = {
        from: new Date(String(req.query.from)),
        to: new Date(String(req.query.to)),
      };
      if (typeof req.query.zoneId === "string" && req.query.zoneId.length > 0) params.zoneId = req.query.zoneId;
      if (typeof req.query.status === "string" && req.query.status.length > 0) params.status = req.query.status;
      if (typeof req.query.customerId === "string" && req.query.customerId.length > 0) params.customerId = req.query.customerId;
      if (typeof req.query.timezone === "string" && req.query.timezone.length > 0) params.timezone = req.query.timezone;
      res.status(200).json(await reportsService.deliveryReport(params));
    } catch (err) {
      next(err);
    }
  }

  async drivers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { from: Date; to: Date; driverId?: string; timezone?: string } = {
        from: new Date(String(req.query.from)),
        to: new Date(String(req.query.to)),
      };
      if (typeof req.query.driverId === "string" && req.query.driverId.length > 0) params.driverId = req.query.driverId;
      if (typeof req.query.timezone === "string" && req.query.timezone.length > 0) params.timezone = req.query.timezone;
      res.status(200).json(await reportsService.driverReport(params));
    } catch (err) {
      next(err);
    }
  }

  async zones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: { from: Date; to: Date; zoneId?: string; timezone?: string } = {
        from: new Date(String(req.query.from)),
        to: new Date(String(req.query.to)),
      };
      if (typeof req.query.zoneId === "string" && req.query.zoneId.length > 0) params.zoneId = req.query.zoneId;
      if (typeof req.query.timezone === "string" && req.query.timezone.length > 0) params.timezone = req.query.timezone;
      res.status(200).json(await reportsService.zoneReport(params));
    } catch (err) {
      next(err);
    }
  }
}