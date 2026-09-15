import { prisma } from "../../shared/utils/prisma.js";
import { logger } from "../../shared/utils/logger.js";
import { CloudinaryAdapter } from "../../integrations/storage/cloudinary.adapter.js";

const storage = new CloudinaryAdapter();

export async function runRetentionCleanup(): Promise<{ [category: string]: number }> {
  const results: { [category: string]: number } = {};
  const startedAt = Date.now();

  try {
    results.idempotency = await cleanIdempotencyRecords();
    results.otpChallenges = await cleanExpiredOtpChallenges();
    results.notifications = await cleanOldNotifications();
    results.outbox = await cleanDeliveredOutbox();
    results.gpsHistory = await cleanGpsHistory();
    results.proofFiles = await cleanProofFiles();

    logger.info({ results, durationMs: Date.now() - startedAt }, "retention cleanup complete");
  } catch (error) {
    logger.error({ err: error }, "retention cleanup failed");
    throw error;
  }

  return results;
}

async function cleanIdempotencyRecords(): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

async function cleanExpiredOtpChallenges(): Promise<number> {
  const result = await prisma.otpChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}

async function cleanOldNotifications(): Promise<number> {
  const days = Number(process.env.RETENTION_NOTIFICATION_DAYS ?? 90);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}

async function cleanDeliveredOutbox(): Promise<number> {
  const days = Number(process.env.RETENTION_OUTBOX_DAYS ?? 30);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.outboxEvent.deleteMany({
    where: { status: "Delivered", processedAt: { lt: cutoff } },
  });
  return result.count;
}

async function cleanGpsHistory(): Promise<number> {
  const days = Number(process.env.RETENTION_GPS_DAYS ?? 30);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.driverLocation.deleteMany({ where: { receivedAt: { lt: cutoff } } });
  return result.count;
}

async function cleanProofFiles(): Promise<number> {
  const days = Number(process.env.RETENTION_PROOF_FILE_DAYS ?? 180);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const files = await prisma.fileObject.findMany({
    where: {
      status: "Accepted",
      uploadedAt: { lt: cutoff },
      order: { status: { in: ["Delivered", "Returned", "Cancelled"] } },
    },
    select: { id: true, key: true, provider: true, orderId: true },
    take: 500,
  });

  for (const file of files) {
    if (file.key && file.key !== "pending" && file.provider === "cloudinary") {
      try {
        await storage.delete(file.key);
      } catch (error) {
        logger.warn({ fileId: file.id, err: error }, "failed to delete expired proof file from storage");
      }
    }
    await prisma.fileObject.update({
      where: { id: file.id },
      data: { status: "Rejected", scanResult: "RETENTION_EXPIRED", scannedAt: new Date(), version: { increment: 1 } },
    });
  }

  return files.length;
}