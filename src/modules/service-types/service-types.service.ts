import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";

export class ServiceTypesService {
  async list(params: { active?: boolean; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.active !== undefined) where.active = params.active;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
      ];
    }
    const types = await prisma.serviceType.findMany({ where, orderBy: { name: "asc" } });
    return {
      data: types.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        description: t.description,
        active: t.active,
        version: t.version,
        createdAt: t.createdAt,
      })),
    };
  }

  async getById(id: string) {
    const st = await prisma.serviceType.findUnique({ where: { id } });
    if (!st) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Service type not found");
    return { id: st.id, name: st.name, code: st.code, description: st.description, active: st.active, version: st.version, createdAt: st.createdAt };
  }

  async create(data: { name: string; code: string; description?: string | null; active?: boolean }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const exists = await prisma.serviceType.findUnique({ where: { code: data.code } });
    if (exists) throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Service type code already exists");

    const st = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceType.create({
        data: { name: data.name, code: data.code, description: data.description ?? null, active: data.active ?? true },
      });
      await writeAudit({ actorId, actorType: "user", action: "service_type.created", resourceType: "serviceType", resourceId: created.id, after: { name: created.name, code: created.code }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return created;
    });
    return { id: st.id, name: st.name, code: st.code, description: st.description, active: st.active, version: st.version, createdAt: st.createdAt };
  }

  async update(id: string, data: { name?: string; description?: string | null; active?: boolean; version?: number }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const before = await prisma.serviceType.findUnique({ where: { id } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Service type not found");
    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceType.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          version: { increment: 1 },
        },
      });
      await writeAudit(
        { actorId, actorType: "user", action: "service_type.updated", resourceType: "serviceType", resourceId: id,
          before: { name: before.name, active: before.active },
          after: { name: data.name ?? before.name, active: data.active ?? before.active },
          requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return result;
    });
    return { id: updated.id, name: updated.name, code: updated.code, description: updated.description, active: updated.active, version: updated.version, createdAt: updated.createdAt };
  }
}