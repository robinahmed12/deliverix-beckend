import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/error-codes.js";

interface IdempotencyOptions {
  expiresInHours?: number;
}

function requestHash(req: Request): string {
  const url = req.originalUrl;
  const body = JSON.stringify(req.body ?? {});
  const method = req.method;
  return createHash("sha256").update(`${method}:${url}:${body}`).digest("hex");
}

function scopeKey(req: Request): string {
  return req.auth?.userId ?? req.ip ?? "anonymous";
}

export function idempotent(options?: IdempotencyOptions) {
  const expiresInMs = (options?.expiresInHours ?? 24) * 60 * 60 * 1000;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      next();
      return;
    }

    const operation = `${req.method}:${req.path}`;
    const scope = scopeKey(req);
    const hash = requestHash(req);
    const expiresAt = new Date(Date.now() + expiresInMs);

    try {
      const found = await prisma.idempotencyRecord.findUnique({
        where: { scopeKey_operation_key: { scopeKey: scope, operation, key } },
      });

      if (found) {
        if (found.status === "Completed" && found.response) {
          if (found.requestHash !== hash) {
            throw new AppError(409, ErrorCodes.IDEMPOTENCY_KEY_REUSED, "Idempotency-Key reused with a different request");
          }
          res.setHeader("X-Idempotency-Replayed", "true");
          res.status(201).json(found.response);
          return;
        }

        if (found.requestHash !== hash) {
          await prisma.idempotencyRecord.update({
            where: { id: found.id },
            data: { expiresAt, requestHash: hash },
          });
        }

        res.setHeader("X-Idempotency-Key", key);
        next();
        return;
      }
    } catch (err) {
      next(err);
      return;
    }

    try {
      await prisma.idempotencyRecord.create({
        data: {
          scopeKey: scope,
          operation,
          key,
          requestHash: hash,
          status: "InProgress",
          expiresAt,
        },
      });

      res.setHeader("X-Idempotency-Key", key);

      const originalJson = res.json.bind(res);

      res.json = (body: unknown) => {
        const rawStatus = res.statusCode;
        if (rawStatus >= 200 && rawStatus < 400) {
          void prisma.idempotencyRecord.updateMany({
            where: { scopeKey: scope, operation, key, status: "InProgress" },
            data: {
              status: "Completed",
              response: body as never,
            },
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}