import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import type { Prisma } from "../../generated/prisma/client.js";

const OFFER_TTL_MS = 5 * 60 * 1000;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function driverEligibilityCheck(driver: {
  active: boolean;
  state: string;
  licenseExpiry: Date | null;
}) {
  if (!driver.active) return "driver is inactive";
  if (driver.licenseExpiry && driver.licenseExpiry <= new Date()) return "driver license is expired";
  if (driver.state !== "Available") return "driver is not available";
  return null;
}

async function checkDriverEligibility(driverId: string, orderZoneId: string | null, tx: Tx) {
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    select: {
      id: true,
      active: true,
      state: true,
      licenseExpiry: true,
      account: { select: { status: true } },
      zones: true,
      vehicleAllocations: { where: { assignedTo: null }, include: { vehicle: true }, orderBy: { assignedFrom: "desc" }, take: 1 },
    },
  });
  if (!driver) return "driver not found";
  if (driver.account.status !== "Active") return "driver account is not active";

  const base = driverEligibilityCheck(driver);
  if (base) return base;

  if (orderZoneId) {
    const zoneLink = driver.zones.find((z) => z.zoneId === orderZoneId);
    if (zoneLink && !zoneLink.allowed) return "driver is not allowed in the order zone";
  }

  const currentVehicle = driver.vehicleAllocations[0]?.vehicle;
  if (!currentVehicle) return "driver has no allocated vehicle";
  if (currentVehicle.status !== "Active") return "driver vehicle is not operational";

  return null;
}

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
}

async function lockDriver(tx: Tx, driverId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${driverId}, 0))`;
}

function assignmentDto(a: Record<string, unknown>) {
  return {
    id: a.id,
    orderId: a.orderId,
    driverId: a.driverId,
    status: a.status,
    assignedById: a.assignedById,
    offerExpiresAt: a.offerExpiresAt,
    offeredAt: a.offeredAt,
    acceptedAt: a.acceptedAt,
    rejectedAt: a.rejectedAt,
    withdrawnAt: a.withdrawnAt,
    releasedAt: a.releasedAt,
    completedAt: a.completedAt,
    reasonCode: a.reasonCode,
    reasonText: a.reasonText,
    version: a.version,
    createdAt: a.createdAt,
  };
}

export class AssignmentService {
  async createOffer(orderId: string, driverId: string, offerExpiresAt: Date | null, assignedById: string, meta: { requestId?: string; ip?: string }) {
    const expiresAt = offerExpiresAt ?? new Date(Date.now() + OFFER_TTL_MS);
    if (expiresAt <= new Date()) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Offer expiry must be in the future");
    }

    const assignment = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      await lockDriver(tx, driverId);

      const order = await tx.deliveryOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, zoneId: true } });
      if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
      if (order.status !== "ReadyForPickup") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only ReadyForPickup orders can receive assignment offers");
      }

      const openForOrder = await tx.deliveryAssignment.count({
        where: { orderId, status: { in: ["Offered", "Accepted"] } },
      });
      if (openForOrder > 0) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Order already has an open assignment");
      }

      const openForDriver = await tx.deliveryAssignment.count({
        where: { driverId, status: { in: ["Offered", "Accepted"] } },
      });
      if (openForDriver > 0) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver already has a reserved or accepted assignment");
      }

      const eligibilityError = await checkDriverEligibility(driverId, order.zoneId, tx);
      if (eligibilityError) {
        throw new AppError(422, ErrorCodes.ASSIGNMENT_CONFLICT, `Driver not eligible: ${eligibilityError}`);
      }

      const created = await tx.deliveryAssignment.create({
        data: {
          orderId,
          driverId,
          status: "Offered",
          assignedById,
          offerExpiresAt: expiresAt,
        },
      });

      await tx.driver.update({ where: { id: driverId }, data: { state: "Assigned" } });

      await tx.driverAvailabilityHistory.create({
        data: { driverId, previousState: "Available", newState: "Assigned", reasonCode: "OFFER_RESERVED", actorId: assignedById },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "assignment.offered",
          eventVersion: "1.0",
          aggregateType: "assignment",
          aggregateId: created.id,
          payload: { assignmentId: created.id, orderId, driverId } as unknown as Prisma.InputJsonValue,
        },
      });

      await writeAudit(
        { actorId: assignedById, actorType: "user", action: "assignment.offered", resourceType: "assignment", resourceId: created.id,
          after: { orderId, driverId, offerExpiresAt: expiresAt }, requestId: meta.requestId ?? null, ip: meta.ip ?? null },
        tx,
      );

      return created;
    });

    return assignmentDto(assignment as unknown as Record<string, unknown>);
  }

  async accept(id: string, auth: { userId: string; roles: string[] }) {
    const assignment = await prisma.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({ where: { id }, select: { id: true, orderId: true, driverId: true, status: true, offerExpiresAt: true, version: true } });
      if (!current) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Assignment not found");
      if (current.driverId !== auth.userId) {
        const profile = await tx.driver.findUnique({ where: { accountId: auth.userId }, select: { id: true } });
        if (!profile || profile.id !== current.driverId) {
          throw new AppError(403, ErrorCodes.FORBIDDEN, "Only the offered driver can accept this assignment");
        }
      }

      if (current.status !== "Offered") {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Assignment is not in Offered state");
      }
      if (current.offerExpiresAt && current.offerExpiresAt <= new Date()) {
        const expired = await tx.deliveryAssignment.update({
          where: { id },
          data: { status: "Expired", reasonCode: "OFFER_EXPIRED", version: { increment: 1 } },
        });
        await tx.driver.updateMany({
          where: { id: current.driverId, state: { in: ["Assigned"] } },
          data: { state: "Available" },
        });
        await tx.driverAvailabilityHistory.create({
          data: { driverId: current.driverId, previousState: "Assigned", newState: "Available", reasonCode: "OFFER_EXPIRED", actorId: auth.userId },
        });
        void expired;
        throw new AppError(409, ErrorCodes.ASSIGNMENT_OFFER_EXPIRED, "Assignment offer has expired");
      }

      await lockOrder(tx, current.orderId);
      await lockDriver(tx, current.driverId);

      const order = await tx.deliveryOrder.findUnique({ where: { id: current.orderId }, select: { id: true, status: true } });
      if (!order || order.status !== "ReadyForPickup") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order is no longer ready for assignment");
      }

      const otherOpen = await tx.deliveryAssignment.count({
        where: { driverId: current.driverId, status: { in: ["Offered", "Accepted"] }, id: { not: id } },
      });
      if (otherOpen > 0) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver capacity already reserved by another assignment");
      }

      const result = await tx.deliveryAssignment.update({
        where: { id },
        data: { status: "Accepted", acceptedAt: new Date(), version: { increment: 1 } },
      });

      await tx.deliveryOrder.update({
        where: { id: current.orderId },
        data: { status: "Assigned", version: { increment: 1 } },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          orderId: current.orderId,
          fromStatus: order.status,
          toStatus: "Assigned",
          actorId: auth.userId,
          actorType: "user",
          reasonCode: "ASSIGNMENT_ACCEPTED",
          requestId: meta0(),
          version: 1,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "assignment.accepted",
          eventVersion: "1.0",
          aggregateType: "assignment",
          aggregateId: id,
          payload: { assignmentId: id, orderId: current.orderId, driverId: current.driverId } as unknown as Prisma.InputJsonValue,
        },
      });

      await writeAudit(
        { actorId: auth.userId, actorType: "user", action: "assignment.accepted", resourceType: "assignment", resourceId: id,
          after: { orderId: current.orderId }, requestId: null, ip: null },
        tx,
      );

      return result;
    });

    return assignmentDto(assignment as unknown as Record<string, unknown>);
  }

  async reject(id: string, auth: { userId: string; roles: string[] }) {
    const assignment = await prisma.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({ where: { id }, select: { id: true, driverId: true, status: true } });
      if (!current) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Assignment not found");
      if (current.driverId !== auth.userId) {
        const profile = await tx.driver.findUnique({ where: { accountId: auth.userId }, select: { id: true } });
        if (!profile || profile.id !== current.driverId) {
          throw new AppError(403, ErrorCodes.FORBIDDEN, "Only the offered driver can reject this assignment");
        }
      }
      if (current.status !== "Offered") {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Assignment is not in Offered state");
      }

      const result = await tx.deliveryAssignment.update({
        where: { id },
        data: { status: "Rejected", rejectedAt: new Date(), reasonCode: "DRIVER_REJECTED", version: { increment: 1 } },
      });

      await tx.driver.updateMany({
        where: { id: current.driverId, state: { in: ["Assigned"] } },
        data: { state: "Available" },
      });
      await tx.driverAvailabilityHistory.create({
        data: { driverId: current.driverId, previousState: "Assigned", newState: "Available", reasonCode: "OFFER_REJECTED", actorId: auth.userId },
      });

      await writeAudit(
        { actorId: auth.userId, actorType: "user", action: "assignment.rejected", resourceType: "assignment", resourceId: id,
          after: { status: "Rejected" }, requestId: null, ip: null },
        tx,
      );

      return result;
    });
    return assignmentDto(assignment as unknown as Record<string, unknown>);
  }

  async withdraw(id: string, actorId: string, reasonCode: string | null, reasonText: string | null, meta: { requestId?: string; ip?: string }) {
    const assignment = await prisma.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({ where: { id }, select: { id: true, orderId: true, driverId: true, status: true } });
      if (!current) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Assignment not found");
      if (current.status !== "Offered") {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Only Offered assignments can be withdrawn");
      }

      const result = await tx.deliveryAssignment.update({
        where: { id },
        data: { status: "Withdrawn", withdrawnAt: new Date(), reasonCode, reasonText, version: { increment: 1 } },
      });

      await tx.driver.updateMany({
        where: { id: current.driverId, state: { in: ["Assigned"] } },
        data: { state: "Available" },
      });
      await tx.driverAvailabilityHistory.create({
        data: { driverId: current.driverId, previousState: "Assigned", newState: "Available", reasonCode: "OFFER_WITHDRAWN", actorId },
      });

      await writeAudit(
        { actorId, actorType: "user", action: "assignment.withdrawn", resourceType: "assignment", resourceId: id,
          before: { status: current.status }, after: { status: "Withdrawn", reasonCode }, reason: reasonCode,
          requestId: meta.requestId ?? null, ip: meta.ip ?? null },
        tx,
      );

      return result;
    });
    return assignmentDto(assignment as unknown as Record<string, unknown>);
  }

  async reassign(orderId: string, driverId: string, reasonCode: string, reasonText: string | null, offerExpiresAt: Date | null, actorId: string, meta: { requestId?: string; ip?: string }) {
    const expiresAt = offerExpiresAt ?? new Date(Date.now() + OFFER_TTL_MS);

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      await lockDriver(tx, driverId);

      const order = await tx.deliveryOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, zoneId: true } });
      if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
      if (order.status !== "ReadyForPickup" && order.status !== "Assigned") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order cannot be reassigned in its current state");
      }

      const previous = await tx.deliveryAssignment.findFirst({
        where: { orderId, status: { in: ["Offered", "Accepted"] } },
        orderBy: { offeredAt: "desc" },
      });

      if (previous) {
        if (previous.driverId === driverId) {
          throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver already has the open assignment for this order");
        }
        await tx.deliveryAssignment.update({
          where: { id: previous.id },
          data: { status: "Released", releasedAt: new Date(), reasonCode, reasonText, version: { increment: 1 } },
        });
        await tx.driver.updateMany({
          where: { id: previous.driverId, state: { in: ["Assigned"] } },
          data: { state: "Available" },
        });
        await tx.driverAvailabilityHistory.create({
          data: { driverId: previous.driverId, previousState: "Assigned", newState: "Available", reasonCode: "REASSIGNED", actorId },
        });
      }

      const openForNewDriver = await tx.deliveryAssignment.count({
        where: { driverId, status: { in: ["Offered", "Accepted"] } },
      });
      if (openForNewDriver > 0) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "New driver already has a reserved or accepted assignment");
      }

      const eligibilityError = await checkDriverEligibility(driverId, order.zoneId, tx);
      if (eligibilityError) {
        throw new AppError(422, ErrorCodes.ASSIGNMENT_CONFLICT, `Driver not eligible: ${eligibilityError}`);
      }

      const created = await tx.deliveryAssignment.create({
        data: { orderId, driverId, status: "Offered", assignedById: actorId, offerExpiresAt: expiresAt, reasonCode, reasonText },
      });

      await tx.driver.update({ where: { id: driverId }, data: { state: "Assigned" } });
      await tx.driverAvailabilityHistory.create({
        data: { driverId, previousState: "Available", newState: "Assigned", reasonCode: "OFFER_RESERVED", actorId },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "assignment.reassigned",
          eventVersion: "1.0",
          aggregateType: "assignment",
          aggregateId: created.id,
          payload: { assignmentId: created.id, orderId, oldDriverId: previous?.driverId ?? null, newDriverId: driverId } as unknown as Prisma.InputJsonValue,
        },
      });

      await writeAudit(
        { actorId, actorType: "user", action: "assignment.reassigned", resourceType: "order", resourceId: orderId,
          before: { previousDriverId: previous?.driverId ?? null }, after: { newDriverId: driverId, reasonCode },
          reason: reasonCode, requestId: meta.requestId ?? null, ip: meta.ip ?? null },
        tx,
      );

      return created;
    });

    return assignmentDto(result as unknown as Record<string, unknown>);
  }

  async expireSingleOffer(tx: Tx, targetDriverId: string) {
    const offered = await tx.deliveryAssignment.findMany({
      where: { driverId: targetDriverId, status: "Offered", offerExpiresAt: { lte: new Date() } },
    });
    for (const a of offered) {
      await tx.deliveryAssignment.update({
        where: { id: a.id },
        data: { status: "Expired", reasonCode: "OFFER_EXPIRED", version: { increment: 1 } },
      });
    }
    if (offered.length > 0) {
      await tx.driver.updateMany({
        where: { id: targetDriverId, state: { in: ["Assigned"] } },
        data: { state: "Available" },
      });
      await tx.driverAvailabilityHistory.create({
        data: { driverId: targetDriverId, previousState: "Assigned", newState: "Available", reasonCode: "OFFER_EXPIRED" },
      });
    }
    return offered.length;
  }

  async expireAndReturnOrder(assignmentId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findUnique({ where: { id: assignmentId } });
      if (!assignment || assignment.status !== "Offered") return;
      if (assignment.offerExpiresAt && assignment.offerExpiresAt > new Date()) return;

      await tx.deliveryAssignment.update({
        where: { id: assignmentId },
        data: { status: "Expired", version: { increment: 1 } },
      });
      await tx.driver.updateMany({
        where: { id: assignment.driverId, state: { in: ["Assigned"] } },
        data: { state: "Available" },
      });
      await tx.driverAvailabilityHistory.create({
        data: { driverId: assignment.driverId, previousState: "Assigned", newState: "Available", reasonCode: "OFFER_EXPIRED" },
      });
    });
  }
}

function meta0(): string | null {
  return null;
}