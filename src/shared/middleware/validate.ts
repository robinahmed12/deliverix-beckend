import type { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, unknown> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.body = result.error.flatten();
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.params = result.error.flatten();
      } else {
        req.params = result.data as typeof req.params;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.query = result.error.flatten();
      } else {
        req.query = result.data as typeof req.query;
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(422).json({
        type: "about:blank",
        title: "Validation Failed",
        status: 422,
        detail: "Request failed validation",
        code: "VALIDATION_FAILED",
        errors,
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
}