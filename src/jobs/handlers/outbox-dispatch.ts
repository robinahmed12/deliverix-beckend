import type { Tx, JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { NotificationsService } from "../../modules/notifications/notifications.service.js";
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

const notificationsService = new NotificationsService();

export const outboxDispatchJob: JobHandler<OutboxRow> = {
  name: "outbox-dispatch",
  query: `
    SELECT
      id,
      event_type                                   AS "eventType",
      event_version                                AS "eventVersion",
      aggregate_type                               AS "aggregateType",
      aggregate_id                                 AS "aggregateId",
      payload,
      status,
      attempts,
      available_after                              AS "availableAfter",
      occurred_at                                  AS "occurredAt"
    FROM outbox_events
    WHERE status IN ('Pending', 'Failed')
      AND (available_after IS NULL OR available_after <= NOW())
    ORDER BY occurred_at ASC
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
      const created = await notificationsService.createFromOutbox(tx, row, target);
      if (!created) {
        await markDelivered(tx, row);
        return;
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
): Promise<{ userId: string; orderId: string | null; type: string; title: string; message: string } | null> {
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
      type: "assignment.offered",
      title: "New delivery offer",
      message: "You have a new delivery assignment offer. Respond before it expires.",
    };
  }

  const orderId = event.aggregateType === "order" ? event.aggregateId : typeof payload.orderId === "string" ? payload.orderId : null;
  if (!orderId) return null;

  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId }, select: { customerId: true } });
  if (!order) return null;

  const customer = await tx.customer.findUnique({
    where: { id: order.customerId },
    select: { accountId: true },
  });
  if (!customer || !customer.accountId) return null;

  const template = notificationTemplate[event.eventType];
  if (!template) return null;

  return {
    userId: customer.accountId,
    orderId,
    type: event.eventType,
    title: template.title,
    message: template.message,
  };
}

const notificationTemplate: Record<string, { title: string; message: string }> = {
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