import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import { CloudinaryAdapter } from "../../integrations/storage/cloudinary.adapter.js";
import { generateSecret, verifySync } from "otplib";
import type { Prisma } from "../../generated/prisma/client.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DELIVERING_STATES = new Set(["PickedUp", "InTransit", "OutForDelivery"]);

const storage = new CloudinaryAdapter();

async function emitOutbox(
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

async function loadAndAuthorize(
  orderId: string,
  auth: { userId: string; roles: string[] },
): Promise<{
  order: { id: string; status: string; customerId: string; proofPolicyId: string | null };
  attempt: { id: string; orderId: string; attemptNumber: number; status: string } | null;
}> {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");

  const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
  if (!isStaff) {
    const driver = await prisma.driver.findUnique({ where: { accountId: auth.userId }, select: { id: true } });
    if (driver) {
      const assignment = await prisma.deliveryAssignment.findFirst({
        where: { orderId, driverId: driver.id, status: "Accepted" },
      });
      if (!assignment) throw new AppError(403, ErrorCodes.FORBIDDEN, "Driver does not have active assignment for this order");
    } else {
      const customer = await prisma.customer.findUnique({ where: { accountId: auth.userId } });
      if (!customer || customer.id !== order.customerId) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied");
      }
    }
  }

  const attempt = await prisma.deliveryAttempt.findFirst({
    where: { orderId, status: "InProgress" },
    orderBy: { attemptNumber: "desc" },
  });

  return { order, attempt };
}

async function requireDriver(orderId: string, auth: { userId: string; roles: string[] }) {
  const driver = await prisma.driver.findUnique({ where: { accountId: auth.userId } });
  if (!driver) throw new AppError(403, ErrorCodes.FORBIDDEN, "No driver profile linked to account");
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { orderId, driverId: driver.id, status: "Accepted" },
  });
  if (!assignment) throw new AppError(403, ErrorCodes.FORBIDDEN, "Only the current assigned driver may submit proof");
  return { driver, assignment };
}

export class ProofService {
  async submitProof(
    orderId: string,
    data:
      | { evidenceType: "RecipientName"; evidenceValue: string }
      | { evidenceType: "Photo"; fileIds: string[] }
      | { evidenceType: "Signature"; fileIds: string[] }
      | { evidenceType: "ConfirmationFlag"; confirmationFlag: true }
      | { evidenceType: "Otp"; evidenceValue: string },
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    if (!DELIVERING_STATES.has(order.status)) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order is not in a delivery phase");
    }

    const { driver } = await requireDriver(orderId, auth);

    const attempt = await prisma.deliveryAttempt.findFirst({
      where: { orderId, status: "InProgress" },
      orderBy: { attemptNumber: "desc" },
    });
    if (!attempt) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "No active delivery attempt");
    }

    if (data.evidenceType === "Otp") {
      const challenge = await prisma.otpChallenge.findFirst({
        where: { orderId, purpose: "ProofOfDelivery", consumedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "No active OTP challenge");
      if (challenge.expiresAt <= new Date()) throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "OTP challenge expired");
      if (challenge.attemptsLeft <= 0) throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "OTP attempts exhausted");

      const result = verifySync({ secret: challenge.challengeHash, token: data.evidenceValue });

      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attemptsLeft: { decrement: 1 } },
      });

      if (!result.valid) throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Invalid OTP code");

      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      const proof = await prisma.$transaction(async (tx) => {
        const created = await tx.deliveryProof.create({
          data: {
            orderId,
            attemptId: attempt.id,
            evidenceType: "Otp",
            evidenceValue: "OTP_VERIFIED",
            status: "Accepted",
            submittedById: driver.id,
          },
        });
        await emitOutbox(tx, {
          eventType: "delivery.proof_submitted",
          aggregateType: "order",
          aggregateId: orderId,
          payload: { orderId, proofId: created.id, evidenceType: "Otp" },
        });
        await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.proof_submitted", resourceType: "deliveryProof", resourceId: created.id, after: { evidenceType: "Otp", status: "Accepted" }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
        return created;
      });

      return { id: proof.id, evidenceType: proof.evidenceType, status: proof.status, submittedAt: proof.submittedAt };
    }

    if (data.evidenceType === "Photo" || data.evidenceType === "Signature") {
      for (const fileId of data.fileIds) {
        const file = await prisma.fileObject.findUnique({ where: { id: fileId } });
        if (!file || file.orderId !== orderId) {
          throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "File not found or not linked to this order");
        }
        if (file.status === "Rejected" || file.status === "FailedProcessing") {
          throw new AppError(409, ErrorCodes.PROOF_NOT_READY, "File has been rejected or failed processing");
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const proofs: Array<{ id: string; evidenceType: string; status: string; submittedAt: Date }> = [];

      if (data.evidenceType === "Photo" || data.evidenceType === "Signature") {
        for (const fileId of data.fileIds) {
          const created = await tx.deliveryProof.create({
            data: {
              orderId,
              attemptId: attempt.id,
              evidenceType: data.evidenceType,
              fileId,
              status: "Pending",
              submittedById: driver.id,
            },
          });
          proofs.push({ id: created.id, evidenceType: created.evidenceType, status: created.status, submittedAt: created.submittedAt });
        }
      } else {
        const created = await tx.deliveryProof.create({
          data: {
            orderId,
            attemptId: attempt.id,
            evidenceType: data.evidenceType,
            evidenceValue: data.evidenceType === "RecipientName" ? data.evidenceValue : null,
            confirmationFlag: data.evidenceType === "ConfirmationFlag" ? data.confirmationFlag : null,
            status: "Pending",
            submittedById: driver.id,
          },
        });
        proofs.push({ id: created.id, evidenceType: created.evidenceType, status: created.status, submittedAt: created.submittedAt });
      }

      await emitOutbox(tx, {
        eventType: "delivery.proof_submitted",
        aggregateType: "order",
        aggregateId: orderId,
        payload: { orderId, evidenceType: data.evidenceType, count: proofs.length },
      });

      await writeAudit(
        {
          actorId: auth.userId,
          actorType: "user",
          action: "delivery.proof_submitted",
          resourceType: "deliveryProof",
          resourceId: orderId,
          after: { evidenceType: data.evidenceType, proofCount: proofs.length },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return proofs;
    });

    return result;
  }

  async listProofs(
    orderId: string,
    params: { cursor?: string; pageSize: number },
    auth: { userId: string; roles: string[] },
  ) {
    const { order: _order } = await loadAndAuthorize(orderId, auth);

    const cursorObj = params.cursor ? decodeCursor<{ id: string }>(params.cursor) : undefined;
    const where: Prisma.DeliveryProofWhereInput = {
      orderId,
      ...(cursorObj ? { id: { gt: cursorObj.id } } : {}),
    };

    const proofs = await prisma.deliveryProof.findMany({
      where,
      take: params.pageSize + 1,
      orderBy: { createdAt: "asc" },
      include: { file: { select: { id: true, mimeType: true, sizeBytes: true, status: true, originalName: true } } },
    });

    const hasMore = proofs.length > params.pageSize;
    const page = hasMore ? proofs.slice(0, params.pageSize) : proofs;
    const last = page.at(-1);

    const proofsWithSignedUrls = await Promise.all(
      page.map(async (p) => {
        let signedUrl: string | null = null;
        if (p.fileId && p.file && p.file.status === "Accepted") {
          try {
            signedUrl = await storage.getSignedUrl(p.file.id);
          } catch {
            signedUrl = null;
          }
        }
        return {
          id: p.id,
          evidenceType: p.evidenceType,
          evidenceValue: p.evidenceType === "RecipientName" ? p.evidenceValue : null,
          confirmationFlag: p.evidenceType === "ConfirmationFlag" ? p.confirmationFlag : null,
          status: p.status,
          submittedById: p.submittedById,
          submittedAt: p.submittedAt,
          correctedById: p.correctedById,
          correctedAt: p.correctedAt,
          file: p.file
            ? { id: p.file.id, originalName: p.file.originalName, mimeType: p.file.mimeType, sizeBytes: p.file.sizeBytes, status: p.file.status }
            : null,
          signedUrl,
          version: p.version,
          createdAt: p.createdAt,
        };
      }),
    );

    return {
      data: proofsWithSignedUrls,
      meta: { nextCursor: last ? encodeCursor({ id: last.id }) : null, hasMore, pageSize: params.pageSize },
    };
  }

  async generateOtpChallenge(
    orderId: string,
    purpose: "ProofOfDelivery" | "ReturnReceipt",
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");

    const policy = await fetchProofPolicy(order.proofPolicyId);
    if (purpose === "ProofOfDelivery" && !policy.requiresOtp) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "OTP is not enabled for this order");
    }

    const secret = generateSecret();

    const activeChallenge = await prisma.otpChallenge.findFirst({
      where: { orderId, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (activeChallenge && activeChallenge.expiresAt > new Date()) {
      const elapsed = Date.now() - activeChallenge.createdAt.getTime();
      if (elapsed < 60_000) {
        throw new AppError(429, ErrorCodes.RATE_LIMITED, "Please wait before requesting a new code");
      }
    }

    const challenge = await prisma.$transaction(async (tx) => {
      const created = await tx.otpChallenge.create({
        data: {
          orderId,
          purpose,
          identifier: auth.userId,
          challengeHash: secret,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          attemptsLeft: 5,
          createdById: auth.userId,
        },
      });

      await writeAudit({ actorId: auth.userId, actorType: "user", action: "delivery.otp_created", resourceType: "otpChallenge", resourceId: created.id, after: { orderId, purpose }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);

      return created;
    });

    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }
}

async function fetchProofPolicy(proofPolicyId: string | null) {
  if (!proofPolicyId) return { requiresOtp: false, requiresRecipientName: true, requiresPhoto: true, requiresSignature: false, requiresConfirmation: false, minPhotos: 1 };
  const pp = await prisma.proofPolicyVersion.findUnique({ where: { id: proofPolicyId } });
  if (!pp || !pp.active) return { requiresOtp: false, requiresRecipientName: true, requiresPhoto: true, requiresSignature: false, requiresConfirmation: false, minPhotos: 1 };
  return pp;
}