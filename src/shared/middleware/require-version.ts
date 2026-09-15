import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/error-codes.js";

export function requireVersion(req: Request, _res: Response, next: NextFunction): void {
  const headerValue = req.header("If-Match") ?? req.header("X-Resource-Version");

  if (!headerValue) {
    next(new AppError(428, ErrorCodes.PRECONDITION_REQUIRED, "If-Match or X-Resource-Version header is required"));
    return;
  }

  const version = parseInt(headerValue.replace(/^W\//, "").trim(), 10);
  if (!Number.isInteger(version) || version < 1) {
    next(new AppError(422, ErrorCodes.VALIDATION_FAILED, "Invalid resource version"));
    return;
  }

  req.version = version;
  next();
}