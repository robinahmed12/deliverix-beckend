import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const RESCHEDULABLE_STATES = new Set([
  "Pending", "ReadyForPickup", "Assigned", "PickedUp", "InTransit", "OutForDelivery", "Failed",
]);

const DELIVERING_STATES = new Set(["PickedUp", "InTransit", "OutForDelivery"]);

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

function orderDto(o: Record<string, unknown>) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    customerId: o.customerId,
    serviceTypeId: o.serviceTypeId,
    zoneId: o.zoneId,
    pickupAddress: o.pickupAddress,
    deliveryAddress: o.deliveryAddress,
    pickupInstructions: o.pickupInstructions,
    deliveryInstructions: o.deliveryInstructions,
    promisedAtStart: o.promisedAtStart,
    promisedAtEnd: o.promisedAtEnd,
    rescheduledAtStart: o.rescheduledAtStart,
    rescheduledAtEnd: o.rescheduledAtEnd,
    deliveryFee: o.deliveryFee,
    currencyCode: o.currencyCode,
    packageNote: o.packageNote,
    readyAt: o.readyAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    failedAt: o.failedAt,
    returnedAt: o.returnedAt,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function getMaxAttempts(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "delivery.maxAttempts" } });
  if (!setting) return 3;
  const val = Number(setting.value);
  return Number.isFinite(val) && val >= 1 ? val : 3;
}

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
}

async function loadAndLockOrder(tx: Tx, orderId: string) {
  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
  return order;
}

async function loadActiveAssignment(tx: Tx, orderId: string, auth: { userId: string; roles: string[] }) {
  const driverProfile = await tx.driver.findUnique({ where: { accountId: auth.userId } });
  if (!driverProfile) throw new AppError(403, ErrorCodes.FORBIDDEN, "No driver profile linked to account");

  const assignment = await tx.deliveryAssignment.findFirst({
    where: {
      orderId,
      driverId: driverProfile.id,
      status: { in: ["Accepted", "Completed"] },
    },
    orderBy: { offeredAt: "desc" },
  });
  if (!assignment || assignment.status !== "Accepted") {
    throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver does not have the current active assignment");
  }
  return { assignment, driver: driverProfile };
}

async function loadInProgressAttempt(tx: Tx, orderId: string) {
  const attempt = await tx.deliveryAttempt.findFirst({
    where: { orderId, status: "InProgress" },
    orderBy: { attemptNumber: "desc" },
  });
  if (!attempt) throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "No active delivery attempt");
  return attempt;
}

async function recordTransition(
  tx: Tx,
  orderId: string,
  from: string,
  to: string,
  actorId: string,
  meta: { requestId?: string; ip?: string },
  version: number,
  reasonCode?: string,
  reasonText?: string | null,
) {
  await tx.deliveryStatusHistory.create({
    data: {
      orderId,
      fromStatus: from as never,
      toStatus: to as never,
      actorId,
      actorType: "user",
      reasonCode: reasonCode ?? null,
      reasonText: reasonText ?? null,
      requestId: meta.requestId ?? null,
      version,
    },
  });
}

async function recordCustody(
  tx: Tx,
  orderId: string,
  fromKind: "Driver" | "Facility" | null,
  fromHolderId: string | null,
  toKind: "Driver" | "Facility",
  toHolderId: string,
  actorId: string,
  reasonCode: string,
  reasonText?: string,
) {
  await tx.custodyEvent.create({
    data: {
      orderId,
      fromKind,
      fromHolderId,
      toKind,
      toHolderId,
      actorId,
      reasonCode,
      reasonText: reasonText ?? null,
    },
  });
}

async function nextAttemptNumber(tx: Tx, orderId: string): Promise<number> {
  const agg = await tx.deliveryAttempt.aggregate({ where: { orderId }, _max: { attemptNumber: true } });
  return (agg._max.attemptNumber ?? 0) + 1;
}

async function fetchProofPolicy(tx: Tx, proofPolicyId: string | null) {
  if (!proofPolicyId) {
    return {
      requiresRecipientName: true,
      requiresPhoto: true,
      requiresSignature: false,
      requiresConfirmation: false,
      requiresOtp: false,
      minPhotos: 1,
    };
  }
  const pp = await tx.proofPolicyVersion.findUnique({ where: { id: proofPolicyId } });
  if (!pp || !pp.active) {
    return {
      requiresRecipientName: true,
      requiresPhoto: true,
      requiresSignature: false,
      requiresConfirmation: false,
      requiresOtp: false,
      minPhotos: 1,
    };
  }
  return pp;
}

async function validateProofEvidence(
  tx: Tx,
  orderId: string,
  attemptId: string,
  proofPolicy: {
    requiresRecipientName: boolean;
    requiresPhoto: boolean;
    requiresSignature: boolean;
    requiresConfirmation: boolean;
    requiresOtp: boolean;
    minPhotos: number;
  },
): Promise<{ ok: boolean; error?: string; proofIds: string[] }> {
  const proofs = await tx.deliveryProof.findMany({
    where: { orderId, attemptId, status: { in: ["Pending", "Accepted"] } },
  });

  const recipientName = proofs.find((p) => p.evidenceType === "RecipientName");
  if (proofPolicy.requiresRecipientName && !recipientName) {
    return { ok: false, error: "PROOF_REQUIRED", proofIds: [] };
  }

  if (proofPolicy.requiresPhoto) {
    const photoProofs = proofs.filter((p) => p.evidenceType === "Photo");
    const validPhotos = await Promise.all(
      photoProofs.map(async (p) => {
        if (!p.fileId) return false;
        const file = await tx.fileObject.findUnique({ where: { id: p.fileId } });
        return file && file.status === "Accepted";
      }),
    );
    const photoCount = validPhotos.filter(Boolean).length;
    if (photoCount < proofPolicy.minPhotos) {
      const anyPending = photoProofs.some((p) => {
        const file = photoProofs.find((pp) => pp.fileId === p.fileId);
        return file !== undefined;
      });
      if (anyPending) return { ok: false, error: "PROOF_NOT_READY", proofIds: [] };
      return { ok: false, error: "PROOF_REQUIRED", proofIds: [] };
    }
  }

  if (proofPolicy.requiresSignature && !proofs.find((p) => p.evidenceType === "Signature")) {
    return { ok: false, error: "PROOF_REQUIRED", proofIds: [] };
  }
  if (proofPolicy.requiresConfirmation && !proofs.find((p) => p.evidenceType === "ConfirmationFlag" && p.confirmationFlag === true)) {
    return { ok: false, error: "PROOF_REQUIRED", proofIds: [] };
  }
  if (proofPolicy.requiresOtp) {
    const otpProofs = proofs.filter((p) => p.evidenceType === "Otp" && p.status === "Accepted");
    if (otpProofs.length === 0) return { ok: false, error: "PROOF_REQUIRED", proofIds: [] };
  }

  return { ok: true, proofIds: proofs.filter((p) => p.status === "Pending").map((p) => p.id) };
}

export class DeliveryService {
  async pickup(
    orderId: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");

    if (order.status !== "Assigned") {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Assigned orders can be picked up");
    }

    if (order.version !== undefined) {
      // If-Match via req.version is validated at middleware level
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const current = await loadAndLockOrder(tx, orderId);
      if (current.status !== "Assigned") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Assigned orders can be picked up");
      }
      const { assignment: _assignment, driver } = await loadActiveAssignment(tx, orderId, auth);

      const attemptNum = await nextAttemptNumber(tx, orderId);
      const attempt = await tx.deliveryAttempt.create({
        data: { orderId, attemptNumber: attemptNum, status: "InProgress" },
      });

      await recordCustody(tx, orderId, null, null, "Driver", driver.id, auth.userId, "PICKUP", "Package picked up by driver");
      await tx.driver.update({ where: { id: driver.id }, data: { state: "OnDelivery" } });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "PickedUp", pickedUpAt: new Date(), version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "Assigned", "PickedUp", auth.userId, meta, updated.version, "DRIVER_PICKUP");
      await emitOutbox(tx, { eventType: "order.picked_up", aggregateType: "order", aggregateId: orderId, payload: { orderId, driverId: driver.id, attemptId: attempt.id } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.pickup", resourceType: "order", resourceId: orderId, before: { status: current.status }, after: { status: "PickedUp" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });

    return orderDto(result as unknown as Record<string, unknown>);
  }

  async inTransit(
    orderId: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "PickedUp") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only PickedUp orders can move to InTransit");
      }
      await loadActiveAssignment(tx, orderId, auth);
      await loadInProgressAttempt(tx, orderId);

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "InTransit", version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "PickedUp", "InTransit", auth.userId, meta, updated.version, "DRIVER_TRANSIT");
      await emitOutbox(tx, { eventType: "order.in_transit", aggregateType: "order", aggregateId: orderId, payload: { orderId } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.in_transit", resourceType: "order", resourceId: orderId, before: { status: "PickedUp" }, after: { status: "InTransit" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async outForDelivery(
    orderId: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "InTransit") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only InTransit orders can move to OutForDelivery");
      }
      await loadActiveAssignment(tx, orderId, auth);
      await loadInProgressAttempt(tx, orderId);

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "OutForDelivery", version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "InTransit", "OutForDelivery", auth.userId, meta, updated.version, "DRIVER_OUT_FOR_DELIVERY");
      await emitOutbox(tx, { eventType: "order.out_for_delivery", aggregateType: "order", aggregateId: orderId, payload: { orderId } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.out_for_delivery", resourceType: "order", resourceId: orderId, before: { status: "InTransit" }, after: { status: "OutForDelivery" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async deliver(
    orderId: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "OutForDelivery") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only OutForDelivery orders can be marked Delivered");
      }
      const { assignment, driver } = await loadActiveAssignment(tx, orderId, auth);
      const attempt = await loadInProgressAttempt(tx, orderId);

      const proofPolicy = await fetchProofPolicy(tx, order.proofPolicyId);
      const validation = await validateProofEvidence(tx, orderId, attempt.id, proofPolicy);
      if (!validation.ok) {
        throw new AppError(
          validation.error === "PROOF_NOT_READY" ? 409 : 422,
          validation.error as typeof ErrorCodes.PROOF_REQUIRED,
          validation.error === "PROOF_NOT_READY"
            ? "Proof files have not finished validation"
            : "Required proof of delivery evidence is missing",
        );
      }

      if (validation.proofIds.length > 0) {
        await tx.deliveryProof.updateMany({
          where: { id: { in: validation.proofIds } },
          data: { status: "Accepted", correctedAt: null, correctedById: null },
        });
      }

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "Delivered", deliveredAt: new Date(), version: { increment: 1 } },
      });

      await tx.deliveryAttempt.update({
        where: { id: attempt.id },
        data: { status: "Delivered", endedAt: new Date(), version: { increment: 1 } },
      });

      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: "Completed", completedAt: new Date(), version: { increment: 1 } },
      });

      await recordCustody(tx, orderId, "Driver", driver.id, "Facility", "SYSTEM", auth.userId, "DELIVERY_COMPLETE", "Package delivered to recipient");
      await recordTransition(tx, orderId, "OutForDelivery", "Delivered", auth.userId, meta, updated.version, "DELIVERY_COMPLETED");
      await emitOutbox(tx, { eventType: "order.delivered", aggregateType: "order", aggregateId: orderId, payload: { orderId, attemptId: attempt.id, driverId: driver.id } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.completed", resourceType: "order", resourceId: orderId, before: { status: order.status }, after: { status: "Delivered" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async fail(
    orderId: string,
    data: { reasonCode: string; reasonText?: string | null },
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const failureReason = await prisma.deliveryFailureReason.findUnique({ where: { code: data.reasonCode } });
    if (!failureReason || !failureReason.active) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Invalid or inactive failure reason code");
    }
    if (failureReason.requiresText && (!data.reasonText || data.reasonText.trim().length === 0)) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "This failure reason requires explanatory text");
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (!DELIVERING_STATES.has(order.status)) {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only PickedUp/InTransit/OutForDelivery orders can be marked Failed");
      }
      await loadActiveAssignment(tx, orderId, auth);
      const attempt = await loadInProgressAttempt(tx, orderId);

      await tx.deliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "Failed",
          endedAt: new Date(),
          failureReasonId: failureReason.id,
          failureReasonText: data.reasonText ?? null,
          version: { increment: 1 },
        },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "Failed", failedAt: new Date(), version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, order.status, "Failed", auth.userId, meta, updated.version, data.reasonCode, data.reasonText);
      await emitOutbox(tx, { eventType: "order.failed", aggregateType: "order", aggregateId: orderId, payload: { orderId, reasonCode: data.reasonCode, attemptId: attempt.id } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.failed", resourceType: "order", resourceId: orderId, before: { status: order.status }, after: { status: "Failed", reasonCode: data.reasonCode }, reason: data.reasonCode, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async retry(
    orderId: string,
    data: { reasonCode?: string | null; reasonText?: string | null },
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const maxAttempts = await getMaxAttempts();

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "Failed") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Failed orders can be retried");
      }
      await loadActiveAssignment(tx, orderId, auth);

      const attemptNum = await nextAttemptNumber(tx, orderId);
      if (attemptNum > maxAttempts) {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Maximum retry attempts exceeded; an authorized return/escalation decision is required");
      }

      const attempt = await tx.deliveryAttempt.create({
        data: { orderId, attemptNumber: attemptNum, status: "InProgress" },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "InTransit", version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "Failed", "InTransit", auth.userId, meta, updated.version, data.reasonCode ?? "RETRY", data.reasonText);
      await emitOutbox(tx, { eventType: "order.in_transit", aggregateType: "order", aggregateId: orderId, payload: { orderId, attemptId: attempt.id, retry: true } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.retry", resourceType: "order", resourceId: orderId, before: { status: "Failed" }, after: { status: "InTransit", attemptNumber: attemptNum }, reason: data.reasonCode ?? null, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async reschedule(
    orderId: string,
    data: { rescheduledAtStart: Date; rescheduledAtEnd: Date; reasonCode: string; reasonText?: string | null },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    if (data.rescheduledAtStart > data.rescheduledAtEnd) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Rescheduled start must be before rescheduled end");
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (!RESCHEDULABLE_STATES.has(order.status)) {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order cannot be rescheduled in its current state");
      }

      const previousStart = order.rescheduledAtStart ?? order.promisedAtStart;
      const previousEnd = order.rescheduledAtEnd ?? order.promisedAtEnd;

      await tx.rescheduleRecord.create({
        data: {
          orderId,
          previousStart: previousStart ?? new Date(),
          previousEnd: previousEnd ?? new Date(),
          newStart: data.rescheduledAtStart,
          newEnd: data.rescheduledAtEnd,
          reasonCode: data.reasonCode,
          reasonText: data.reasonText ?? null,
          actorId,
        },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: {
          rescheduledAtStart: data.rescheduledAtStart,
          rescheduledAtEnd: data.rescheduledAtEnd,
          version: { increment: 1 },
        },
      });

      await emitOutbox(tx, { eventType: "order.rescheduled", aggregateType: "order", aggregateId: orderId, payload: { orderId, reasonCode: data.reasonCode } });
      await writeAudit({ actorId, actorType: "user", action: "delivery.rescheduled", resourceType: "order", resourceId: orderId, after: { rescheduledAtStart: data.rescheduledAtStart, rescheduledAtEnd: data.rescheduledAtEnd, reasonCode: data.reasonCode }, reason: data.reasonCode, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async startReturn(
    orderId: string,
    data: { reasonCode: string; reasonText?: string | null },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "Failed") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Failed orders can initiate a return");
      }

      const lastAttempt = await tx.deliveryAttempt.findFirst({
        where: { orderId, status: "Failed" },
        orderBy: { attemptNumber: "desc" },
      });

      const returnRecord = await tx.returnRecord.create({
        data: {
          orderId,
          attemptId: lastAttempt?.id ?? null,
          status: "InProgress",
          reasonCode: data.reasonCode,
          reasonText: data.reasonText ?? null,
          initiatedById: actorId,
        },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "ReturnInProgress", version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "Failed", "ReturnInProgress", actorId, meta, updated.version, data.reasonCode, data.reasonText);
      await emitOutbox(tx, { eventType: "return.started", aggregateType: "order", aggregateId: orderId, payload: { orderId, returnRecordId: returnRecord.id } });
      await writeAudit({ actorId, actorType: "user", action: "delivery.return_started", resourceType: "order", resourceId: orderId, before: { status: order.status }, after: { status: "ReturnInProgress" }, reason: data.reasonCode, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async returnProof(
    orderId: string,
    data: { fileId: string },
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.deliveryOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
      if (order.status !== "ReturnInProgress") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order is not in ReturnInProgress state");
      }

      const file = await tx.fileObject.findUnique({ where: { id: data.fileId } });
      if (!file || file.orderId !== orderId) {
        throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "File not found or not linked to this order");
      }

      const returnRecord = await tx.returnRecord.findFirst({
        where: { orderId, status: "InProgress" },
        orderBy: { createdAt: "desc" },
      });
      if (!returnRecord) {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "No active return record");
      }

      const updated = await tx.returnRecord.update({
        where: { id: returnRecord.id },
        data: { evidenceId: data.fileId, version: { increment: 1 } },
      });

      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.return_proof", resourceType: "order", resourceId: orderId, after: { evidenceId: data.fileId }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });

    return { id: result.id, orderId: result.orderId, evidenceId: result.evidenceId, version: result.version };
  }

  async confirmReturn(
    orderId: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "ReturnInProgress") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order is not in ReturnInProgress state");
      }

      const returnRecord = await tx.returnRecord.findFirst({
        where: { orderId, status: "InProgress" },
        orderBy: { createdAt: "desc" },
      });
      if (!returnRecord) {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "No active return record");
      }

      if (!returnRecord.evidenceId) {
        throw new AppError(422, ErrorCodes.PROOF_REQUIRED, "Return proof evidence is required before confirmation");
      }

      const evidenceFile = await tx.fileObject.findUnique({ where: { id: returnRecord.evidenceId } });
      if (!evidenceFile || evidenceFile.status !== "Accepted") {
        throw new AppError(409, ErrorCodes.PROOF_NOT_READY, "Return evidence has not passed validation");
      }

      await tx.returnRecord.update({
        where: { id: returnRecord.id },
        data: { status: "Returned", confirmedById: auth.userId, confirmedAt: new Date(), version: { increment: 1 } },
      });

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "Returned", returnedAt: new Date(), version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "ReturnInProgress", "Returned", auth.userId, meta, updated.version, "RETURN_CONFIRMED");
      await emitOutbox(tx, { eventType: "order.returned", aggregateType: "order", aggregateId: orderId, payload: { orderId, returnRecordId: returnRecord.id } });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.return_confirmed", resourceType: "order", resourceId: orderId, before: { status: order.status }, after: { status: "Returned" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async confirmPickupReceipt(
    orderId: string,
    data: { reasonCode: string; reasonText?: string | null },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await loadAndLockOrder(tx, orderId);
      if (order.status !== "Failed") {
        throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Failed orders can have pickup receipt confirmed");
      }

      await recordCustody(tx, orderId, "Driver", null, "Facility", "SYSTEM", actorId, "PACKAGE_RETURNED_TO_PICKUP", "Package physically returned to authorized facility");

      const updated = await tx.deliveryOrder.update({
        where: { id: orderId },
        data: { status: "ReadyForPickup", version: { increment: 1 } },
      });

      await recordTransition(tx, orderId, "Failed", "ReadyForPickup", actorId, meta, updated.version, data.reasonCode, data.reasonText);
      await emitOutbox(tx, { eventType: "order.ready", aggregateType: "order", aggregateId: orderId, payload: { orderId, requeued: true } });
      await writeAudit({ actorId, actorType: "user", action: "delivery.pickup_receipt_confirmed", resourceType: "order", resourceId: orderId, before: { status: order.status }, after: { status: "ReadyForPickup" }, reason: data.reasonCode, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return updated;
    });
    return orderDto(result as unknown as Record<string, unknown>);
  }

  async getAttempts(
    orderId: string,
    params: { cursor?: string; pageSize: number },
  ) {
    const cursorObj = params.cursor ? decodeCursor<{ id: string }>(params.cursor) : undefined;
    const where: Prisma.DeliveryAttemptWhereInput = {
      orderId,
      ...(cursorObj ? { id: { gt: cursorObj.id } } : {}),
    };

    const attempts = await prisma.deliveryAttempt.findMany({
      where,
      take: params.pageSize + 1,
      orderBy: { attemptNumber: "asc" },
      include: { failureReason: true },
    });

    const hasMore = attempts.length > params.pageSize;
    const page = hasMore ? attempts.slice(0, params.pageSize) : attempts;
    const last = page.at(-1);

    return {
      data: page.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
        failureReason: a.failureReason
          ? { code: a.failureReason.code, label: a.failureReason.label }
          : null,
        failureReasonText: a.failureReasonText,
        version: a.version,
        createdAt: a.createdAt,
      })),
      meta: { nextCursor: last ? encodeCursor({ id: last.id }) : null, hasMore, pageSize: params.pageSize },
    };
  }

  async getTracking(
    orderId: string,
    auth: { userId: string; roles: string[] },
  ) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");

    const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
    if (!isStaff) {
      const driverProfile = await prisma.driver.findUnique({ where: { accountId: auth.userId }, select: { id: true } });
      if (!driverProfile) {
        const customer = await prisma.customer.findUnique({ where: { accountId: auth.userId } });
        if (!customer || customer.id !== order.customerId) {
          throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied");
        }
      } else {
        const assignment = await prisma.deliveryAssignment.findFirst({
          where: { orderId, driverId: driverProfile.id, status: { in: ["Accepted", "Completed"] } },
        });
        if (!assignment) {
          throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied");
        }
      }
    }

    const timeline = await prisma.deliveryStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: {
        fromStatus: true,
        toStatus: true,
        reasonCode: true,
        reasonText: true,
        actorType: true,
        createdAt: true,
      },
    });

    const isTerminal = ["Delivered", "Cancelled", "Returned"].includes(order.status);

    const effectiveWindowStart = order.rescheduledAtStart ?? order.promisedAtStart;
    const effectiveWindowEnd = order.rescheduledAtEnd ?? order.promisedAtEnd;

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: order.status,
      promisedWindow: { start: order.promisedAtStart, end: order.promisedAtEnd },
      effectiveWindow: effectiveWindowStart ? { start: effectiveWindowStart, end: effectiveWindowEnd } : null,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
      failedAt: order.failedAt,
      location: isTerminal ? null : null,
      eta: null,
      timeline,
      version: order.version,
      updatedAt: order.updatedAt,
    };
  }
}