import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const MAX_HEADER_LENGTH = 64;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length <= MAX_HEADER_LENGTH ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}