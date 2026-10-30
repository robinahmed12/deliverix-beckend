import type { Tx, JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { NotificationsService } from "../../modules/notifications/notifications.service.js";
import { nodemailerAdapter } from "../../integrations/email/nodemailer.adapter.js";
import { renderDriverStatusEmail } from "../../integrations/email/templates/index.js";
import { logger } from "../../shared/utils/logger.js";
import { prisma } from "../../shared/utils/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

interface OutboxRow extends ClaimableRow {
  eventType: string;
  eventVersion: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  availableAfter: Date | null;
  occurredAt: Date;
}

export interface TargetResult {
  userId: string | null;
  orderId: string | null;
  customerEmail: string | null;
  customerName: string;
  orderNumber: string;
  driverInfo?: {
    driverCode: string;
    name?: string | undefined;
    phone?: string | undefined;
  } | undefined;
  type: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

const notificationsService = new NotificationsService();

export const outboxDispatchJob: JobHandler<OutboxRow> = {
  name: "outbox-dispatch",
  query: `
    SELECT
      id,
      "eventType"                                  AS "eventType",
      "eventVersion"                               AS "eventVersion",
      "aggregateType"                              AS "aggregateType",
      "aggregateId"                                AS "aggregateId",
      payload,
      status,
      attempts,
      "availableAfter"                             AS "availableAfter",
      "occurredAt"                                 AS "occurredAt"
    FROM outbox_events
    WHERE status IN ('Pending', 'Failed')
      AND ("availableAfter" IS NULL OR "availableAfter" <= NOW())
    ORDER BY "occurredAt" ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    const target = await resolveTarget(tx, row);
    if (!target) {
      await markDelivered(tx, row);
      return;
    }

    try {
      if (target.userId) {
        // 1. Registered Customer or Driver: In-App notification
        const created = await notificationsService.createFromOutbox(tx, row, {
          userId: target.userId,
          orderId: target.orderId,
          type: target.type,
          title: target.title,
          message: target.message,
          payload: target.payload,
        });

        // 2. Dual-channel: enqueue email delivery for registered customer order milestones
        if (created && target.customerEmail && target.type !== "assignment.offered") {
          await tx.notificationDelivery.create({
            data: {
              notificationId: created.id,
              channel: "Email",
              status: "Pending",
              attempts: 0,
            },
          });
        }
      } else if (target.customerEmail && target.type !== "assignment.offered") {
        // 3. Guest Customer (ASM-003): cannot store in Notification due to User FK; send directly via email adapter
        const emailContent = renderDriverStatusEmail(target.type, {
          customerName: target.customerName,
          orderNumber: target.orderNumber,
          driverName: target.driverInfo?.name,
          driverCode: target.driverInfo?.driverCode,
          contactPhone: target.driverInfo?.phone,
          deliveryAddress: typeof target.payload.deliveryAddress === "string" ? target.payload.deliveryAddress : undefined,
          deliveryWindow: typeof target.payload.deliveryWindow === "string" ? target.payload.deliveryWindow : undefined,
          pickupTime: typeof target.payload.pickedUpAt === "string" ? target.payload.pickedUpAt : undefined,
          deliveredAt: typeof target.payload.deliveredAt === "string" ? target.payload.deliveredAt : undefined,
          recipientName: typeof target.payload.recipientName === "string" ? target.payload.recipientName : undefined,
          proofType: typeof target.payload.proofType === "string" ? target.payload.proofType : undefined,
          proofUrl: typeof target.payload.proofUrl === "string" ? target.payload.proofUrl : undefined,
          reasonCode: typeof target.payload.reasonCode === "string" ? target.payload.reasonCode : undefined,
          reasonText: typeof target.payload.reasonText === "string" ? target.payload.reasonText : undefined,
          attemptNumber: typeof target.payload.attemptNumber === "number" ? target.payload.attemptNumber : undefined,
          trackingUrl: `/tracking/${target.orderNumber || target.orderId || ""}`,
        });

        if (emailContent) {
          await nodemailerAdapter.send({
            to: target.customerEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });
        }
      }

      await markDelivered(tx, row);
    } catch (error) {
      await recordOutboxFailure(tx, row, error);
    }
  },
};

async function markDelivered(tx: Tx, row: OutboxRow) {
  await tx.outboxEvent.update({
    where: { id: row.id },
    data: { status: "Delivered", processedAt: new Date(), lastError: null },
  });
}

async function recordOutboxFailure(tx: Tx, row: OutboxRow, error: unknown) {
  const settings = await loadSettings(tx);
  const attempts = row.attempts + 1;
  const message = error instanceof Error ? error.message : String(error);
  logger.warn({ eventId: row.id, eventType: row.eventType, attempts, err: message }, "outbox event failed");

  if (attempts >= settings.maxAttempts) {
    await tx.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: "DeadLettered",
        attempts,
        lastError: message,
        availableAfter: null,
      },
    });
    return;
  }

  await tx.outboxEvent.update({
    where: { id: row.id },
    data: {
      status: "Failed",
      attempts,
      lastError: message,
      availableAfter: new Date(Date.now() + settings.backoffBaseMs * 2 ** (attempts - 1)),
    },
  });
}

interface OutboXettings {
  maxAttempts: number;
  backoffBaseMs: number;
}

async function loadSettings(tx: Tx): Promise<OutboXettings> {
  const maxSetting = await tx.systemSetting.findUnique({ where: { key: "outbox.max_retry_attempts" } });
  const backoffSetting = await tx.systemSetting.findUnique({ where: { key: "outbox.retry_backoff_base_ms" } });
  const maxAttempts = Number(maxSetting?.value ?? 5);
  const backoffBaseMs = Number(backoffSetting?.value ?? 30_000);
  return {
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? maxAttempts : 5,
    backoffBaseMs: Number.isFinite(backoffBaseMs) && backoffBaseMs >= 1_000 ? backoffBaseMs : 30_000,
  };
}

async function resolveTarget(
  tx: Tx,
  event: OutboxRow,
): Promise<TargetResult | null> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  if (event.eventType === "assignment.offered") {
    const driverId = typeof payload.driverId === "string" ? payload.driverId : "";
    const orderId = typeof payload.orderId === "string" ? payload.orderId : null;
    if (!driverId || !orderId) return null;

    const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { accountId: true } });
    if (!driver) return null;

    return {
      userId: driver.accountId,
      orderId,
      customerEmail: null,
      customerName: "Driver",
      orderNumber: typeof payload.orderNumber === "string" ? payload.orderNumber : "",
      type: "assignment.offered",
      title: "New delivery offer",
      message: "You have a new delivery assignment offer. Respond before it expires.",
      payload,
    };
  }

  const orderId = event.aggregateType === "order" ? event.aggregateId : typeof payload.orderId === "string" ? payload.orderId : null;
  if (!orderId) return null;

  const order = await tx.deliveryOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      deliveryAddress: true,
      customer: {
        select: { id: true, name: true, email: true, accountId: true },
      },
    },
  });
  if (!order || !order.customer) return null;

  const template = notificationTemplate[event.eventType];
  if (!template) return null;

  let driverInfo: { driverCode: string; name?: string | undefined; phone?: string | undefined } | undefined;
  const driverId = typeof payload.driverId === "string" ? payload.driverId : null;
  if (driverId) {
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      select: {
        driverCode: true,
        contactPhone: true,
        account: { select: { name: true } },
      },
    });
    if (driver) {
      driverInfo = {
        driverCode: driver.driverCode,
        name: driver.account?.name,
        phone: driver.contactPhone ?? undefined,
      };
    }
  }

  const enrichedPayload: Record<string, unknown> = {
    ...payload,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customer.email,
    customerName: order.customer.name,
    deliveryAddress: order.deliveryAddress,
    driverInfo,
  };

  return {
    userId: order.customer.accountId, // Null for guest customers (ASM-003)
    orderId: order.id,
    customerEmail: order.customer.email,
    customerName: order.customer.name,
    orderNumber: order.orderNumber,
    driverInfo,
    type: event.eventType,
    title: template.title,
    message: template.message,
    payload: enrichedPayload,
  };
}

const notificationTemplate: Record<string, { title: string; message: string }> = {
  "assignment.offered": { title: "New delivery offer", message: "You have a new delivery assignment offer. Respond before it expires." },
  "assignment.accepted": { title: "Driver assigned to your order", message: "A driver has accepted your order and is heading for pickup." },
  "order.ready": { title: "Order ready for pickup", message: "Your order is ready for pickup." },
  "order.picked_up": { title: "Pickup confirmed", message: "Your package has been picked up and is now on the way." },
  "order.in_transit": { title: "In transit", message: "Your package is in transit." },
  "order.out_for_delivery": { title: "Out for delivery", message: "Your package is out for delivery." },
  "order.delivered": { title: "Delivery completed", message: "Your order was delivered successfully." },
  "order.failed": { title: "Delivery failed", message: "A delivery attempt for your order did not succeed." },
  "order.rescheduled": { title: "Delivery rescheduled", message: "Your delivery window has been updated." },
  "return.started": { title: "Return in progress", message: "Your order is being returned." },
  "order.returned": { title: "Return completed", message: "Your order has been returned." },
};

export async function recoverInterruptedOutboxEvents(): Promise<void> {
  const result = await prisma.outboxEvent.updateMany({
    where: { status: "Processing" },
    data: { status: "Pending", lastError: "interrupted: worker restart" },
  });
  logger.info({ reset: result.count }, "recovered interrupted outbox events");
}
