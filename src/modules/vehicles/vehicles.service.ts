import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";

function vehicleDto(v: {
  id: string;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  vehicleType: string;
  capacityValue: unknown;
  capacityUnit: string;
  status: string;
  qualification: string | null;
  version: number;
  createdAt: Date;
}) {
  return {
    id: v.id,
    registrationNumber: v.registrationNumber,
    make: v.make,
    model: v.model,
    vehicleType: v.vehicleType,
    capacityValue: v.capacityValue,
    capacityUnit: v.capacityUnit,
    status: v.status,
    qualification: v.qualification,
    version: v.version,
    createdAt: v.createdAt,
  };
}

export class VehiclesService {
  async list(params: { page: number; pageSize: number; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status !== undefined) where.status = params.status;
    if (params.search) {
      where.OR = [{ registrationNumber: { contains: params.search, mode: "insensitive" } }];
    }

    const [total, vehicles] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      data: vehicles.map(vehicleDto),
      meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.ceil(total / params.pageSize) },
    };
  }

  async getById(id: string) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { driverAllocations: { where: { assignedTo: null }, include: { driver: true }, orderBy: { assignedFrom: "desc" } } },
    });
    if (!vehicle) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Vehicle not found");
    return {
      ...vehicleDto(vehicle),
      currentDriver: vehicle.driverAllocations[0]?.driver
        ? { id: vehicle.driverAllocations[0].driver.id, driverCode: vehicle.driverAllocations[0].driver.driverCode }
        : null,
    };
  }

  async create(data: {
    registrationNumber: string;
    make?: string | null;
    model?: string | null;
    vehicleType: string;
    capacityValue: number;
    capacityUnit: string;
    qualification?: string | null;
  }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const exists = await prisma.vehicle.findUnique({ where: { registrationNumber: data.registrationNumber } });
    if (exists) throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Vehicle registration already exists");

    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          registrationNumber: data.registrationNumber,
          make: data.make ?? null,
          model: data.model ?? null,
          vehicleType: data.vehicleType,
          capacityValue: data.capacityValue,
          capacityUnit: data.capacityUnit,
          qualification: data.qualification ?? null,
          status: "Active",
        },
      });
      await writeAudit({ actorId, actorType: "user", action: "vehicle.created", resourceType: "vehicle", resourceId: created.id, after: { registrationNumber: created.registrationNumber }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return created;
    });
    return vehicleDto(vehicle);
  }

  async update(id: string, data: Record<string, unknown> & { version?: number }, actorId: string, meta: { requestId?: string; ip?: string }) {
    const before = await prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Vehicle not found");
    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const updateData: Record<string, unknown> = { version: { increment: 1 } };
    for (const key of ["make", "model", "vehicleType", "capacityUnit", "qualification"] as const) {
      if (data[key] !== undefined) updateData[key] = data[key] === null ? null : data[key];
    }
    if (data.capacityValue !== undefined) updateData.capacityValue = data.capacityValue;
    if (data.status !== undefined) updateData.status = data.status;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.vehicle.update({ where: { id }, data: updateData });
      await writeAudit({ actorId, actorType: "user", action: "vehicle.updated", resourceType: "vehicle", resourceId: id,
        before: { status: before.status }, after: { status: result.status }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return result;
    });
    return vehicleDto(updated);
  }

  async allocate(id: string, driverId: string, reasonCode: string | null, actorId: string, meta: { requestId?: string; ip?: string }) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Vehicle not found");
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Driver not found");

    const allocation = await prisma.$transaction(async (tx) => {
      await tx.driverVehicleAssignment.updateMany({
        where: { vehicleId: id, assignedTo: null },
        data: { assignedTo: new Date() },
      });
      await tx.driverVehicleAssignment.updateMany({
        where: { driverId, assignedTo: null },
        data: { assignedTo: new Date() },
      });
      const created = await tx.driverVehicleAssignment.create({
        data: { driverId, vehicleId: id, reasonCode },
      });
      await writeAudit({ actorId, actorType: "user", action: "vehicle.allocated", resourceType: "driverVehicleAssignment", resourceId: created.id, after: { vehicleId: id, driverId }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return created;
    });
    return { id: allocation.id, vehicleId: id, driverId, assignedFrom: allocation.assignedFrom, assignedTo: allocation.assignedTo };
  }

  async deallocate(id: string, driverId?: string, actorId?: string, meta?: { requestId?: string; ip?: string }) {
    const where: Record<string, unknown> = { vehicleId: id, assignedTo: null };
    if (driverId) where.driverId = driverId;

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.driverVehicleAssignment.updateMany({ where, data: { assignedTo: new Date() } });
      if (actorId && meta) {
        await writeAudit({ actorId, actorType: "user", action: "vehicle.deallocated", resourceType: "vehicle", resourceId: id, after: { released: count.count }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      }
      return count;
    });
    return { released: result.count };
  }
}