import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import type { Prisma } from "../../generated/prisma/client.js";

export class ConfigManagementService {
  async listFailureReasons(active?: boolean) {
    const where: Prisma.DeliveryFailureReasonWhereInput = {};
    if (active !== undefined) where.active = active;
    const reasons = await prisma.deliveryFailureReason.findMany({ where, orderBy: { code: "asc" } });
    return { data: reasons.map((r) => ({ id: r.id, code: r.code, label: r.label, requiresText: r.requiresText, active: r.active, createdAt: r.createdAt })) };
  }

  async createFailureReason(data: { code: string; label: string; requiresText?: boolean; active?: boolean }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const exists = await prisma.deliveryFailureReason.findUnique({ where: { code: data.code } });
    if (exists) throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Failure reason code already exists");

    const created = await prisma.$transaction(async (tx) => {
      const r = await tx.deliveryFailureReason.create({ data: { code: data.code, label: data.label, requiresText: data.requiresText ?? false, active: data.active ?? true } });
      await writeAudit({ actorId, actorType: "user", action: "config.failure_reason_created", resourceType: "failureReason", resourceId: r.id, after: { code: r.code, label: r.label }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return r;
    });
    return { id: created.id, code: created.code, label: created.label, requiresText: created.requiresText, active: created.active, createdAt: created.createdAt };
  }

  async updateFailureReason(id: string, data: { label?: string; requiresText?: boolean; active?: boolean }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const before = await prisma.deliveryFailureReason.findUnique({ where: { id } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Failure reason not found");

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.deliveryFailureReason.update({
        where: { id },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.requiresText !== undefined ? { requiresText: data.requiresText } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
      });
      await writeAudit({ actorId, actorType: "user", action: "config.failure_reason_updated", resourceType: "failureReason", resourceId: id,
        before: { label: before.label, active: before.active }, after: { label: r.label, active: r.active }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return r;
    });
    return { id: updated.id, code: updated.code, label: updated.label, requiresText: updated.requiresText, active: updated.active, createdAt: updated.createdAt };
  }

  async listProofPolicies(active?: boolean) {
    const where: Prisma.ProofPolicyVersionWhereInput = {};
    if (active !== undefined) where.active = active;
    const policies = await prisma.proofPolicyVersion.findMany({ where, orderBy: { createdAt: "desc" } });
    return { data: policies.map((p) => ({
      id: p.id, policyVersion: p.policyVersion, requiresRecipientName: p.requiresRecipientName, requiresPhoto: p.requiresPhoto,
      requiresSignature: p.requiresSignature, requiresConfirmation: p.requiresConfirmation, requiresOtp: p.requiresOtp,
      minPhotos: p.minPhotos, active: p.active, createdAt: p.createdAt,
    })) };
  }

  async createProofPolicy(
    data: { policyVersion: string; requiresRecipientName?: boolean; requiresPhoto?: boolean; requiresSignature?: boolean; requiresConfirmation?: boolean; requiresOtp?: boolean; minPhotos?: number },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const exists = await prisma.proofPolicyVersion.findUnique({ where: { policyVersion: data.policyVersion } });
    if (exists) throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Policy version already exists");

    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.proofPolicyVersion.create({
        data: {
          policyVersion: data.policyVersion,
          requiresRecipientName: data.requiresRecipientName ?? true,
          requiresPhoto: data.requiresPhoto ?? true,
          requiresSignature: data.requiresSignature ?? false,
          requiresConfirmation: data.requiresConfirmation ?? false,
          requiresOtp: data.requiresOtp ?? false,
          minPhotos: data.minPhotos ?? 1,
          active: true,
        },
      });
      await writeAudit({ actorId, actorType: "user", action: "config.proof_policy_created", resourceType: "proofPolicy", resourceId: p.id, after: { policyVersion: p.policyVersion }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return p;
    });
    return { id: created.id, policyVersion: created.policyVersion, active: created.active, createdAt: created.createdAt };
  }

  async activateProofPolicy(id: string, active: boolean, actorId: string, meta: { requestId?: string; ip?: string }) {
    const before = await prisma.proofPolicyVersion.findUnique({ where: { id } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Proof policy not found");

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.proofPolicyVersion.update({ where: { id }, data: { active } });
      await writeAudit({ actorId, actorType: "user", action: "config.proof_policy_updated", resourceType: "proofPolicy", resourceId: id, before: { active: before.active }, after: { active: p.active }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return p;
    });
    return { id: updated.id, policyVersion: updated.policyVersion, active: updated.active, createdAt: updated.createdAt };
  }

  async listSettings() {
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
    return { data: settings.map((s) => ({ key: s.key, value: s.value, sensitive: s.sensitive, updatedAt: s.updatedAt })) };
  }

  async updateSetting(key: string, value: unknown, actorId: string, meta: { requestId?: string; ip?: string }) {
    const before = await prisma.systemSetting.findUnique({ where: { key } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, `Setting '${key}' not found`);

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.systemSetting.update({
        where: { key },
        data: { value: value as Prisma.InputJsonValue, updatedById: actorId },
      });
      await writeAudit({ actorId, actorType: "user", action: "config.setting_updated", resourceType: "systemSetting", resourceId: s.id, before: before.sensitive ? { value: "[REDACTED]" } : { value: before.value }, after: before.sensitive ? { value: "[REDACTED]" } : { value: s.value }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return s;
    });
    return { key: updated.key, value: updated.value, sensitive: updated.sensitive, updatedAt: updated.updatedAt };
  }
}