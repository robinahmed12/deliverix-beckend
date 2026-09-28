import type { prisma } from "./prisma.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Returns a driver to `Available` once they hold no open assignment.
 *
 * A driver's state is owned by the workflow: it goes `Assigned` when an offer
 * is created and `OnDelivery` on pickup, and no other code puts it back. A
 * driver that completed a delivery therefore stayed `OnDelivery` forever, and
 * since `checkDriverEligibility` requires `Available` they could never be
 * offered another order -- one delivery per driver, per account, ever.
 *
 * Two guards keep this from clobbering anything:
 * - only `OnDelivery` is reset, so a self-service `Offline`/`Unavailable`
 *   (or a workflow `Assigned`) is never overridden;
 * - a driver still holding an `Offered`/`Accepted` assignment is left alone,
 *   since they are not actually idle.
 *
 * Must be called inside the same transaction that closes out the work.
 */
export async function releaseDriverIfIdle(
  tx: Tx,
  driverId: string,
  reasonCode: string,
  actorId: string,
): Promise<boolean> {
  const openAssignments = await tx.deliveryAssignment.count({
    where: { driverId, status: { in: ["Offered", "Accepted"] } },
  });
  if (openAssignments > 0) return false;

  const released = await tx.driver.updateMany({
    where: { id: driverId, state: "OnDelivery" },
    data: { state: "Available" },
  });
  if (released.count === 0) return false;

  await tx.driverAvailabilityHistory.create({
    data: {
      driverId,
      previousState: "OnDelivery",
      newState: "Available",
      reasonCode,
      actorId,
    },
  });

  return true;
}
