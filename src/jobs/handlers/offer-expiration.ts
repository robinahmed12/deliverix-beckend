import type { Tx, JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { writeAudit } from "../../shared/utils/audit.js";
import type { Prisma } from "../../generated/prisma/client.js";

interface ExpiredOfferRow extends ClaimableRow {
  driverId: string;
  orderId: string;
}

function emitOutbox(
  tx: Tx,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
) {
  return tx.outboxEvent.create({
    data: {
      eventType: event.eventType,
      eventVersion: "1.0",
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export const offerExpirationJob: JobHandler<ExpiredOfferRow> = {
  name: "offer-expiration",
  query: `
    SELECT d.id, d.driver_id AS "driverId", d.order_id AS "orderId"
    FROM delivery_assignments d
    WHERE d.status = 'Offered' AND d.offer_expires_at <= NOW()
    ORDER BY d.offer_expires_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    const updated = await tx.deliveryAssignment.updateMany({
      where: { id: row.id, status: "Offered", offerExpiresAt: { lte: new Date() } },
      data: { status: "Expired", reasonCode: "OFFER_EXPIRED", version: { increment: 1 } },
    });
    if (updated.count === 0) return;

    await tx.driver.updateMany({
      where: { id: row.driverId, state: "Assigned" },
      data: { state: "Available" },
    });

    await tx.driverAvailabilityHistory.create({
      data: {
        driverId: row.driverId,
        previousState: "Assigned",
        newState: "Available",
        reasonCode: "OFFER_EXPIRED",
        actorId: "system:offer-expiration",
      },
    });

    await emitOutbox(tx, {
      eventType: "assignment.expired",
      aggregateType: "assignment",
      aggregateId: row.id,
      payload: { assignmentId: row.id, orderId: row.orderId, driverId: row.driverId },
    });

    await writeAudit(
      {
        actorId: null,
        actorType: "system",
        action: "assignment.offer_expired",
        resourceType: "assignment",
        resourceId: row.id,
        after: { status: "Expired", driverId: row.driverId },
        reason: "OFFER_EXPIRED",
        requestId: null,
        ip: null,
      },
      tx,
    );
  },
};