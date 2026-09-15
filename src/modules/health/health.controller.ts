import type { Request, Response } from "express";
import { prisma } from "../../shared/utils/prisma.js";

export class HealthController {
  live(_req: Request, res: Response): void {
    res.status(200).json({ status: "ok" });
  }

  async ready(_req: Request, res: Response): Promise<void> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "down" });
    }
  }
}