import type { Request, Response, NextFunction } from "express";
import { RolesService } from "./roles.service.js";

const rolesService = new RolesService();

export class RolesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.query.user as string | undefined;
      const result = await rolesService.list(userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}