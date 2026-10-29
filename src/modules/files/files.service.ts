import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { logger } from "../../shared/utils/logger.js";
import { CloudinaryAdapter } from "../../integrations/storage/cloudinary.adapter.js";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_ORDER = 5;
const MAX_SIGNED_URL_TTL_MS = 5 * 60 * 1000;

const storage = new CloudinaryAdapter();

function validateContent(buffer: Buffer): { valid: boolean; detectedType: string } {
  if (buffer.length >= 4) {
    const hex = Array.from(buffer.subarray(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex.startsWith("ffd8ff")) return { valid: true, detectedType: "image/jpeg" };
    if (hex.startsWith("89504e47")) return { valid: true, detectedType: "image/png" };
  }
  return { valid: false, detectedType: "application/octet-stream" };
}

export class FilesService {
  async upload(
    orderId: string | undefined,
    attemptId: string | undefined,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    uploadedById: string,
    meta: { requestId?: string; ip?: string },
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new AppError(415, ErrorCodes.VALIDATION_FAILED, "Only JPEG and PNG files are allowed");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(413, ErrorCodes.VALIDATION_FAILED, "File size must be at most 5MB");
    }

    const contentCheck = validateContent(file.buffer);
    if (!contentCheck.valid) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "File content is not a valid JPEG or PNG image");
    }

    if (orderId) {
      const orderFiles = await prisma.fileObject.count({ where: { orderId, status: { notIn: ["Rejected", "FailedProcessing"] } } });
      if (orderFiles >= MAX_FILES_PER_ORDER) {
        throw new AppError(422, ErrorCodes.VALIDATION_FAILED, `Maximum ${MAX_FILES_PER_ORDER} files per order already uploaded`);
      }
    }

    const fileObject = await prisma.fileObject.create({
      data: {
        orderId: orderId ?? null,
        attemptId: attemptId ?? null,
        provider: "cloudinary",
        key: "pending",
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: "Uploaded",
        uploadedById,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    try {
      const tmpPath = join(tmpdir(), `deliverix-${fileObject.id}-${randomUUID()}.bin`);
      await writeFile(tmpPath, file.buffer);

      const result = await storage.upload(
        { id: fileObject.id, path: tmpPath, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size },
        orderId ? `orders/${orderId}/proofs` : "proofs/unlinked",
      );

      await prisma.fileObject.update({
        where: { id: fileObject.id },
        data: { key: result.key, status: "Scanning" },
      });

      await unlink(tmpPath).catch(() => {});

      await writeAudit({ actorId: uploadedById, actorType: "user", action: "file.uploaded", resourceType: "fileObject", resourceId: fileObject.id, after: { orderId: orderId ?? null, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, prisma);

      return {
        id: fileObject.id,
        key: result.key,
        status: "Scanning",
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedAt: fileObject.uploadedAt,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      await prisma.fileObject.update({ where: { id: fileObject.id }, data: { status: "FailedProcessing" } });
      throw new AppError(503, ErrorCodes.DEPENDENCY_UNAVAILABLE, "File storage is temporarily unavailable");
    }
  }

  async updateScanStatus(
    id: string,
    data: { status: "Accepted" | "Rejected" | "FailedProcessing"; scanResult?: string | null },
    meta: { requestId?: string; ip?: string },
  ) {
    const file = await prisma.fileObject.findUnique({ where: { id } });
    if (!file) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "File not found");
    if (file.status === "Accepted" || file.status === "Rejected" || file.status === "FailedProcessing") {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "File is already in a terminal scan state");
    }

    const updated = await prisma.fileObject.update({
      where: { id },
      data: {
        status: data.status,
        scanResult: data.scanResult ?? null,
        scannedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await writeAudit({ actorId: null, actorType: "system", action: "file.scan_completed", resourceType: "fileObject", resourceId: id, before: { status: file.status }, after: { status: data.status, scanResult: data.scanResult ?? null }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, prisma);

    return { id: updated.id, status: updated.status, scannedAt: updated.scannedAt };
  }

  /**
   * Discards an upload that is not attached to any proof evidence.
   *
   * Quota relief for the order-level upload ceiling (FILE-002 allows 5 per
   * submission; the implementation guards the whole order). The record is NOT
   * hard-deleted (BR-002): it flips to `Rejected` with `scanResult`
   * "USER_DISCARDED" and the storage object is removed. The per-order count
   * already excludes `Rejected`/`FailedProcessing`, so capacity is freed.
   * POD-004: files attached to submitted proof evidence are immutable and can
   * never be discarded this way.
   */
  async discard(
    id: string,
    auth: { userId: string; roles: string[] },
    meta: { requestId?: string; ip?: string },
  ) {
    const file = await prisma.fileObject.findUnique({ where: { id } });
    if (!file) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "File not found");

    const isStaff = auth.roles.some((r) => ["admin", "dispatcher"].includes(r));
    const isUploader = file.uploadedById === auth.userId;
    if (!isUploader && !isStaff) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, "Only the uploading driver may discard this file");
    }

    const attached = await prisma.deliveryProof.findFirst({
      where: { fileId: id },
      select: { id: true },
    });
    if (attached) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "File is attached to submitted proof evidence and cannot be discarded (POD-004)");
    }
    if (file.status === "Rejected" || file.status === "FailedProcessing") {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "File is already discarded or failed");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.fileObject.update({
        where: { id },
        data: {
          status: "Rejected",
          scanResult: "USER_DISCARDED",
          scannedAt: new Date(),
          expiresAt: new Date(),
          version: { increment: 1 },
        },
      });
      await writeAudit({ actorId: auth.userId, actorType: "user", action: "file.discarded", resourceType: "fileObject", resourceId: id, before: { status: file.status }, after: { status: "Rejected", scanResult: "USER_DISCARDED" }, reason: "USER_DISCARDED", requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return updated;
    });

    if (file.key && file.key !== "pending") {
      try {
        await storage.delete(file.key);
      } catch (err) {
        logger.warn({ fileId: id, err }, "failed to delete discarded upload from storage");
      }
    }

    return { id: updated.id, status: updated.status, scannedAt: updated.scannedAt };
  }

  /**
   * Lists non-rejected uploads for an order that are NOT attached to any
   * proof evidence — i.e. the files a driver may discard to free upload
   * quota. Callable by the order's assigned driver or staff.
   */
  async listUnlinked(
    orderId: string,
    auth: { userId: string; roles: string[] },
  ) {
    const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
    if (!isStaff) {
      const driver = await prisma.driver.findUnique({ where: { accountId: auth.userId }, select: { id: true } });
      const assignment = driver
        ? await prisma.deliveryAssignment.findFirst({
            where: { orderId, driverId: driver.id, status: { in: ["Accepted", "Completed"] } },
          })
        : null;
      if (!assignment) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, "Only the assigned driver or staff may see this order's uploads");
      }
    }

    const [allFiles, linkedFileIds] = await Promise.all([
      prisma.fileObject.findMany({
        where: { orderId, status: { in: ["Uploaded", "Scanning", "Accepted"] } },
        orderBy: { uploadedAt: "desc" },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true, uploadedAt: true },
      }),
      prisma.deliveryProof.findMany({ where: { orderId }, select: { fileId: true } }),
    ]);

    const linked = new Set(linkedFileIds.map((p) => p.fileId));
    const files = allFiles.filter((f) => !linked.has(f.id));
    return { data: files, meta: { pageSize: files.length, hasMore: false, nextCursor: null } };
  }

  async getSignedUrl(id: string, auth: { userId: string; roles: string[] }) {
    const file = await prisma.fileObject.findUnique({ where: { id } });
    if (!file) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "File not found");
    if (file.status !== "Accepted") {
      throw new AppError(409, ErrorCodes.PROOF_NOT_READY, "File has not passed validation");
    }

    if (file.orderId) {
      const order = await prisma.deliveryOrder.findUnique({ where: { id: file.orderId } });
      if (order) {
        const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
        if (!isStaff) {
          const customer = await prisma.customer.findUnique({ where: { accountId: auth.userId } });
          const driver = await prisma.driver.findUnique({ where: { accountId: auth.userId } });
          if (!customer || customer.id !== order.customerId) {
            if (!driver) {
              throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied");
            }
            const assignment = await prisma.deliveryAssignment.findFirst({
              where: { orderId: file.orderId, driverId: driver.id, status: { in: ["Accepted", "Completed"] } },
            });
            if (!assignment) throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied");
          }
        }
      }
    }

    const url = await storage.getSignedUrl(file.key, MAX_SIGNED_URL_TTL_MS);

    await writeAudit({ actorId: auth.userId, actorType: "user", action: "file.signed_url_generated", resourceType: "fileObject", resourceId: id, after: { expiresAt: new Date(Date.now() + MAX_SIGNED_URL_TTL_MS) }, requestId: null, ip: null }, prisma);

    return { url, expiresInMs: MAX_SIGNED_URL_TTL_MS, expiresAt: new Date(Date.now() + MAX_SIGNED_URL_TTL_MS) };
  }

  async batchScanAccept(fileIds: string[], meta: { requestId?: string; ip?: string }) {
    await prisma.$transaction(async (tx) => {
      for (const id of fileIds) {
        const file = await tx.fileObject.findUnique({ where: { id } });
        if (!file || file.status !== "Scanning") continue;
        await tx.fileObject.update({
          where: { id },
          data: { status: "Accepted", scannedAt: new Date(), version: { increment: 1 } },
        });
      }
      await writeAudit({ actorId: null, actorType: "system", action: "file.batch_scan_accepted", resourceType: "fileObject", resourceId: fileIds[0] ?? "", after: { count: fileIds.length }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
    });
  }
}