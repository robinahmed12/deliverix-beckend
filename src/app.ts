import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import { requestIdMiddleware } from "./shared/middleware/request-id.js";
import { logger } from "./shared/utils/logger.js";
import healthRouter from "./modules/health/health.routes.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);
  app.use("/api/v1", (_req, res) => {
    res.status(404).json({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "API not yet implemented",
      code: "RESOURCE_NOT_FOUND",
      requestId: _req.requestId,
    });
  });

  app.use(errorHandler);

  return app;
}