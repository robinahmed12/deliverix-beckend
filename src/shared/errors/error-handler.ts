import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { ErrorCode } from "./error-codes.js";
import { AppError } from "./app-error.js";
import { logger } from "../utils/logger.js";

const HTTP_STATUS_TITLES: Record<number, string> = {
  400: "Malformed Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  412: "Precondition Failed",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Validation Failed",
  428: "Precondition Required",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

function titleFor(status: number): string {
  return HTTP_STATUS_TITLES[status] ?? "Error";
}

function asError(value: unknown): Error & { code?: string } {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;
  const error = asError(err);

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      type: "about:blank",
      title: titleFor(err.status),
      status: err.status,
      detail: err.message,
      code: err.code,
      requestId,
    };
    if (err.detail !== undefined) {
      body.detail = err.detail;
    }
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      type: "about:blank",
      title: titleFor(422),
      status: 422,
      detail: "Request failed validation",
      code: "VALIDATION_FAILED" satisfies ErrorCode,
      errors: err.flatten(),
      requestId,
    });
    return;
  }

  if (error.code === "P2002") {
    res.status(409).json({
      type: "about:blank",
      title: titleFor(409),
      status: 409,
      detail: "A record with the same unique value already exists",
      code: "ASSIGNMENT_CONFLICT" satisfies ErrorCode,
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId, route: req.originalUrl }, "unhandled error");
  res.status(500).json({
    type: "about:blank",
    title: titleFor(500),
    status: 500,
    detail: "An unexpected error occurred",
    code: "INTERNAL" as const,
    requestId,
  });
}