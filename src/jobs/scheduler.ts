import cron, { type ScheduledTask } from "node-cron";
import { JobRunner } from "./lib/job-runner.js";
import { offerExpirationJob } from "./handlers/offer-expiration.js";
import { outboxDispatchJob, recoverInterruptedOutboxEvents } from "./handlers/outbox-dispatch.js";
import { notificationRetryJob } from "./handlers/notification-retry.js";
import { fileCleanupJob } from "./handlers/file-cleanup.js";
import { runRetentionCleanup } from "./handlers/retention-cleanup.js";
import { logger } from "../shared/utils/logger.js";

const runner = new JobRunner();

interface RegisteredJob {
  name: string;
  schedule: string;
  run: () => Promise<void>;
  task?: ScheduledTask | undefined;
  running: boolean;
}

const jobs: RegisteredJob[] = [
  {
    name: "offer-expiration",
    schedule: "*/30 * * * * *",
    run: async () => { await runner.runOnce(offerExpirationJob); },
    running: false,
  },
  {
    name: "outbox-dispatch",
    schedule: "*/10 * * * * *",
    run: async () => { await runner.runOnce(outboxDispatchJob); },
    running: false,
  },
  {
    name: "notification-retry",
    schedule: "* * * * * *",
    run: async () => { await runner.runOnce(notificationRetryJob); },
    running: false,
  },
  {
    name: "file-cleanup",
    schedule: "0 * * * *",
    run: async () => { await runner.runOnce(fileCleanupJob); },
    running: false,
  },
  {
    name: "retention-cleanup",
    schedule: "0 2 * * *",
    run: async () => { await runRetentionCleanup(); },
    running: false,
  },
];

async function guardedRun(job: RegisteredJob): Promise<void> {
  if (job.running) {
    logger.debug({ job: job.name }, "skipping overlapping job tick");
    return;
  }
  job.running = true;
  try {
    await job.run();
  } catch (error) {
    logger.error({ err: error, job: job.name }, "scheduled job failed");
  } finally {
    job.running = false;
  }
}

export function startScheduler(): void {
  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      throw new Error(`invalid cron schedule for job ${job.name}: ${job.schedule}`);
    }
    job.task = cron.schedule(
      job.schedule,
      () => {
        void guardedRun(job);
      },
      { scheduled: true },
    );
    logger.info({ job: job.name, schedule: job.schedule }, "scheduled job registered");
  }
}

export async function stopScheduler(): Promise<void> {
  const jobsToClear = jobs.filter((job) => job.running);
  while (jobsToClear.some((job) => job.running)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  for (const job of jobs) {
    job.task?.stop();
    job.task = undefined as ScheduledTask | undefined;
  }
  logger.info("scheduler stopped");
}

export async function initializeScheduler(): Promise<void> {
  await recoverInterruptedOutboxEvents();
  startScheduler();
}

let shutdownSignalsBound = false;

export function bindShutdownHandlers(): void {
  if (shutdownSignalsBound) return;
  shutdownSignalsBound = true;
  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutdown signal received, draining jobs");
    void stopScheduler().finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}