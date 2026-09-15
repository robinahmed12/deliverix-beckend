import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import { requestIdMiddleware } from "./shared/middleware/request-id.js";
import { logger } from "./shared/utils/logger.js";
import healthRouter from "./modules/health/health.routes.js";
import authRouter from "./modules/auth/auth.routes.js";
import usersRouter from "./modules/users/users.routes.js";
import rolesRouter from "./modules/roles/roles.routes.js";
import customersRouter from "./modules/customers/customers.routes.js";
import ordersRouter from "./modules/orders/orders.routes.js";
import zonesRouter from "./modules/zones/zones.routes.js";
import serviceTypesRouter from "./modules/service-types/service-types.routes.js";
import configRouter from "./modules/config-management/config-management.routes.js";
import driversRouter from "./modules/drivers/drivers.routes.js";
import vehiclesRouter from "./modules/vehicles/vehicles.routes.js";
import assignmentRouter from "./modules/dispatch/assignment.routes.js";
import dispatchRouter from "./modules/dispatch/dispatch.routes.js";

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
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/roles", rolesRouter);
  app.use("/api/v1/customers", customersRouter);
  app.use("/api/v1/orders", ordersRouter);
  app.use("/api/v1/zones", zonesRouter);
  app.use("/api/v1/service-types", serviceTypesRouter);
  app.use("/api/v1/config", configRouter);
  app.use("/api/v1/drivers", driversRouter);
  app.use("/api/v1/vehicles", vehiclesRouter);
  app.use("/api/v1", assignmentRouter);
  app.use("/api/v1/dispatch", dispatchRouter);
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