import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import type { Prisma } from "../../generated/prisma/client.js";

function zoneDto(z: Record<string, unknown>) {
  return {
    id: z.id,
    name: z.name,
    code: z.code,
    active: z.active,
    priority: z.priority,
    deliveryFee: z.deliveryFee,
    currencyCode: z.currencyCode,
    version: z.version,
    createdAt: z.createdAt,
  };
}

export class ZonesService {
  async list(params: { active?: boolean; search?: string }) {
    const where: Prisma.DeliveryZoneWhereInput = {};
    if (params.active !== undefined) where.active = params.active;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const zones = await prisma.deliveryZone.findMany({
      where,
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });

    return { data: zones.map((z) => zoneDto(z as unknown as Record<string, unknown>)) };
  }

  async getById(id: string) {
    const zone = await prisma.deliveryZone.findUnique({
      where: { id },
      include: { areas: { orderBy: { createdAt: "asc" } } },
    });
    if (!zone) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Zone not found");
    }
    return {
      id: zone.id,
      name: zone.name,
      code: zone.code,
      active: zone.active,
      priority: zone.priority,
      deliveryFee: zone.deliveryFee,
      currencyCode: zone.currencyCode,
      version: zone.version,
      createdAt: zone.createdAt,
      areas: zone.areas.map((a) => ({
        id: a.id,
        name: a.name,
        latitude: a.latitude,
        longitude: a.longitude,
        radiusMeters: a.radiusMeters,
        active: a.active,
      })),
    };
  }

  async create(
    data: {
      name: string;
      code: string;
      active?: boolean;
      priority?: number;
      deliveryFee?: number | null;
      currencyCode?: string;
      areas?: Array<{ name?: string | null; latitude?: number | null; longitude?: number | null; radiusMeters?: number | null; polygon?: unknown; active?: boolean }>;
    },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const existingCode = await prisma.deliveryZone.findUnique({ where: { code: data.code } });
    if (existingCode) {
      throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Zone code already exists");
    }

    const zone = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryZone.create({
        data: {
          name: data.name,
          code: data.code,
          active: data.active ?? true,
          priority: data.priority ?? 0,
          deliveryFee: data.deliveryFee ?? null,
          currencyCode: data.currencyCode ?? "USD",
          areas: {
            create: (data.areas ?? []).map((a) => ({
              name: a.name ?? null,
              latitude: a.latitude ?? null,
              longitude: a.longitude ?? null,
              radiusMeters: a.radiusMeters ?? null,
              polygon: a.polygon as Prisma.InputJsonValue | undefined ?? undefined,
              active: a.active ?? true,
            })),
          },
        },
        include: { areas: true },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "zone.created",
          resourceType: "zone",
          resourceId: created.id,
          after: { name: created.name, code: created.code, deliveryFee: created.deliveryFee },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return created;
    });

    return zoneDto(zone as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: { name?: string; active?: boolean; priority?: number; deliveryFee?: number | null; version?: number },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const before = await prisma.deliveryZone.findUnique({ where: { id } });
    if (!before) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Zone not found");
    }

    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.deliveryZone.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          ...(data.priority !== undefined ? { priority: data.priority } : {}),
          ...(data.deliveryFee !== undefined ? { deliveryFee: data.deliveryFee } : {}),
          version: { increment: 1 },
        },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "zone.updated",
          resourceType: "zone",
          resourceId: id,
          before: { name: before.name, active: before.active, deliveryFee: before.deliveryFee },
          after: {
            name: data.name ?? before.name,
            active: data.active ?? before.active,
            deliveryFee: data.deliveryFee === undefined ? before.deliveryFee : data.deliveryFee,
          },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return result;
    });

    return zoneDto(updated as unknown as Record<string, unknown>);
  }
}