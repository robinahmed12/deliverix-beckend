import type { Tx, JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { nodemailerAdapter } from "../../integrations/email/nodemailer.adapter.js";
import { logger } from "../../shared/utils/logger.js";

interface NotificationDeliveryRow extends ClaimableRow {
  notificationId: string;
  channel: string;
  status: string;
  attempts: number;
}

const emailAdapter = nodemailerAdapter;

export const notificationRetryJob: JobHandler<NotificationDeliveryRow> = {
  name: "notification-retry",
  query: `
    SELECT
      nd.id,
      nd.notification_id      AS "notificationId",
      nd.channel,
      nd.status,
      nd.attempts,
      nd.next_retry_at        AS "nextRetryAt"
    FROM notification_deliveries nd
    WHERE nd.status IN ('Pending', 'Failed')
      AND (nd.next_retry_at IS NULL OR nd.next_retry_at <= NOW())
    ORDER BY nd.created_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    const notification = await tx.notification.findUnique({
      where: { id: row.notificationId },
      select: { userId: true, title: true, message: true, channel: true },
    });
    if (!notification) {
      await tx.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "DeadLettered", lastError: "notification record no longer exists" },
      });
      return;
    }

    if (row.channel === "InApp") {
      await tx.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "Sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null },
      });
      return;
    }

    if (row.channel === "Email") {
      const settings = await loadSettings(tx);
      const attempts = row.attempts + 1;

      try {
        const user = await tx.user.findUnique({
          where: { id: notification.userId },
          select: { email: true },
        });
        if (!user) {
          await tx.notificationDelivery.update({
            where: { id: row.id },
            data: { status: "DeadLettered", attempts, lastError: "user has no email" },
          });
          return;
        }

        const result = await emailAdapter.send({
          to: user.email,
          subject: notification.title,
          html: notification.message,
        });

        await tx.notificationDelivery.update({
          where: { id: row.id },
          data: { status: "Sent", sentAt: new Date(), attempts, providerRef: result.messageId, lastError: null },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ deliveryId: row.id, attempts, err: message }, "notification email delivery failed");

        if (attempts >= settings.maxAttempts) {
          await tx.notificationDelivery.update({
            where: { id: row.id },
            data: { status: "DeadLettered", attempts, lastError: message, nextRetryAt: null },
          });
          return;
        }

        await tx.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: "Failed",
            attempts,
            lastError: message,
            nextRetryAt: new Date(Date.now() + settings.backoffBaseMs * 2 ** (attempts - 1)),
          },
        });
      }
    }
  },
};

interface NotificationRetrySettings {
  maxAttempts: number;
  backoffBaseMs: number;
}

async function loadSettings(tx: Tx): Promise<NotificationRetrySettings> {
  const maxSetting = await tx.systemSetting.findUnique({ where: { key: "notification.max_retry_attempts" } });
  const backoffSetting = await tx.systemSetting.findUnique({ where: { key: "notification.retry_backoff_base_ms" } });
  const maxAttempts = Number(maxSetting?.value ?? 5);
  const backoffBaseMs = Number(backoffSetting?.value ?? 30_000);
  return {
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? maxAttempts : 5,
    backoffBaseMs: Number.isFinite(backoffBaseMs) && backoffBaseMs >= 1_000 ? backoffBaseMs : 30_000,
  };
}