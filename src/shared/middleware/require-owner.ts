import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/error-codes.js";

export function requireOwner(ownerField: string = "userId") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Authentication required"));
      return;
    }

    const resourceOwnerId = req.params[ownerField] ?? req.body[ownerField];

    if (resourceOwnerId && resourceOwnerId !== req.auth.userId) {
      const isAdmin = req.auth.roles.includes("admin");
      if (!isAdmin) {
        next(new AppError(403, ErrorCodes.FORBIDDEN, "Access denied"));
        return;
      }
    }

    next();
  };
}