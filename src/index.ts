import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initializeScheduler, stopScheduler } from "./jobs/scheduler.js";
import { logger } from "./shared/utils/logger.js";
import { prisma } from "./shared/utils/prisma.js";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "deliverix API listening");
  initializeScheduler().catch((err: unknown) =>
    logger.error({ err }, "scheduler initialization failed; background jobs disabled"),
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  const force = setTimeout(() => {
    logger.error("shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000);
  force.unref();

  void stopScheduler().then(() => {
    server.close(() => {
      prisma
        .$disconnect()
        .catch((err: unknown) => logger.error({ err }, "prisma disconnect failed"))
        .finally(() => {
          logger.info("shutdown complete");
          process.exit(0);
        });
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));