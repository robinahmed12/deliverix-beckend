import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/error-codes.js";

export function authorize(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Authentication required"));
      return;
    }

    if (requiredPermissions.length === 0) {
      next();
      return;
    }

    // Admins bypass specific permission checks
    if (req.auth.roles?.includes("admin")) {
      next();
      return;
    }

    // Customers are always authorized for self-service customer/order operations
    if (
      req.auth.roles?.includes("customer") &&
      requiredPermissions.some((p) => p.startsWith("customers.me") || p.startsWith("orders.me"))
    ) {
      next();
      return;
    }

    const hasPermission = requiredPermissions.some((perm) => req.auth!.permissions?.includes(perm));

    if (!hasPermission) {
      next(new AppError(403, ErrorCodes.FORBIDDEN, "Insufficient permissions"));
      return;
    }

    next();
  };
}