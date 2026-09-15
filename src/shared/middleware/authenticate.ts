import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/error-codes.js";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next(new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Authentication required"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    next();
  } catch {
    next(new AppError(401, ErrorCodes.AUTH_SESSION_REVOKED, "Invalid or expired token"));
  }
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookieHeader = req.header("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}