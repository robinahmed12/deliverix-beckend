import type { Tx, JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { nodemailerAdapter } from "../../integrations/email/nodemailer.adapter.js";
import { renderDriverStatusEmail } from "../../integrations/email/templates/index.js";
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
      nd."notificationId"     AS "notificationId",
      nd.channel,
      nd.status,
      nd.attempts,
      nd."nextRetryAt"        AS "nextRetryAt"
    FROM notification_deliveries nd
    WHERE nd.status IN ('Pending', 'Failed')
      AND (nd."nextRetryAt" IS NULL OR nd."nextRetryAt" <= NOW())
    ORDER BY nd."createdAt" ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    const notification = await tx.notification.findUnique({
      where: { id: row.notificationId },
      select: { userId: true, title: true, message: true, channel: true, type: true, orderId: true, payload: true },
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
          select: { email: true, name: true },
        });

        const payload = (notification.payload ?? {}) as Record<string, unknown>;
        const recipientEmail = (typeof payload.customerEmail === "string" ? payload.customerEmail : null) ?? user?.email ?? null;

        if (!recipientEmail) {
          await tx.notificationDelivery.update({
            where: { id: row.id },
            data: { status: "DeadLettered", attempts, lastError: "user has no email" },
          });
          return;
        }

        const customerName = (typeof payload.customerName === "string" ? payload.customerName : null) ?? user?.name ?? "Customer";
        const orderNumber = typeof payload.orderNumber === "string" ? payload.orderNumber : "";
        const driverInfo = payload.driverInfo as { name?: string; driverCode?: string; phone?: string } | undefined;

        const rendered = renderDriverStatusEmail(notification.type, {
          customerName,
          orderNumber,
          driverName: driverInfo?.name,
          driverCode: driverInfo?.driverCode,
          contactPhone: driverInfo?.phone,
          deliveryAddress: typeof payload.deliveryAddress === "string" ? payload.deliveryAddress : undefined,
          deliveryWindow: typeof payload.deliveryWindow === "string" ? payload.deliveryWindow : undefined,
          pickupTime: typeof payload.pickedUpAt === "string" ? payload.pickedUpAt : undefined,
          deliveredAt: typeof payload.deliveredAt === "string" ? payload.deliveredAt : undefined,
          recipientName: typeof payload.recipientName === "string" ? payload.recipientName : undefined,
          proofType: typeof payload.proofType === "string" ? payload.proofType : undefined,
          proofUrl: typeof payload.proofUrl === "string" ? payload.proofUrl : undefined,
          reasonCode: typeof payload.reasonCode === "string" ? payload.reasonCode : undefined,
          reasonText: typeof payload.reasonText === "string" ? payload.reasonText : undefined,
          attemptNumber: typeof payload.attemptNumber === "number" ? payload.attemptNumber : undefined,
          trackingUrl: `/tracking/${orderNumber || notification.orderId || ""}`,
        });

        const subject = rendered ? rendered.subject : notification.title;
        const html = rendered ? rendered.html : notification.message;
        const text = rendered ? rendered.text : notification.message;

        const result = await emailAdapter.send({
          to: recipientEmail,
          subject,
          html,
          text,
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

interface NotificationSettings {
  maxAttempts: number;
  backoffBaseMs: number;
}

async function loadSettings(tx: Tx): Promise<NotificationSettings> {
  const maxSetting = await tx.systemSetting.findUnique({ where: { key: "notification.max_retry_attempts" } });
  const backoffSetting = await tx.systemSetting.findUnique({ where: { key: "notification.retry_backoff_base_ms" } });
  const maxAttempts = Number(maxSetting?.value ?? 5);
  const backoffBaseMs = Number(backoffSetting?.value ?? 30_000);
  return {
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? maxAttempts : 5,
    backoffBaseMs: Number.isFinite(backoffBaseMs) && backoffBaseMs >= 1_000 ? backoffBaseMs : 30_000,
  };
}
