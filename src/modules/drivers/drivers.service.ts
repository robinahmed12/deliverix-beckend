import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import type { DriverAvailabilityState } from "../../generated/prisma/client.js";

function driverDto(d: {
  id: string;
  driverCode: string;
  accountId: string;
  contactPhone: string;
  licenseNumber: string | null;
  licenseExpiry: Date | null;
  qualification: string | null;
  active: boolean;
  state: string;
  version: number;
  createdAt: Date;
}) {
  return {
    id: d.id,
    driverCode: d.driverCode,
    accountId: d.accountId,
    contactPhone: d.contactPhone,
    licenseNumber: d.licenseNumber,
    licenseExpiry: d.licenseExpiry,
    qualification: d.qualification,
    active: d.active,
    state: d.state,
    version: d.version,
    createdAt: d.createdAt,
  };
}

function isValidLicense(licenseExpiry: Date | null): boolean {
  return !licenseExpiry || licenseExpiry > new Date();
}

export class DriversService {
  async list(params: { page: number; pageSize: number; state?: string; active?: boolean; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.state !== undefined) where.state = params.state;
    if (params.active !== undefined) where.active = params.active;
    if (params.search) {
      where.OR = [
        { driverCode: { contains: params.search, mode: "insensitive" } },
        { contactPhone: { contains: params.search } },
      ];
    }

    const [total, drivers] = await Promise.all([
      prisma.driver.count({ where }),
      prisma.driver.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      data: drivers.map(driverDto),
      meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.ceil(total / params.pageSize) },
    };
  }

  async getById(id: string) {
    const driver = await prisma.driver.findUnique({
      where: { id },
      include: {
        vehicleAllocations: {
          where: { assignedTo: null },
          include: { vehicle: true },
          orderBy: { assignedFrom: "desc" },
        },
      },
    });
    if (!driver) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Driver not found");

    return {
      ...driverDto(driver),
      currentVehicle: driver.vehicleAllocations[0]?.vehicle
        ? {
            id: driver.vehicleAllocations[0].vehicle.id,
            registrationNumber: driver.vehicleAllocations[0].vehicle.registrationNumber,
            vehicleType: driver.vehicleAllocations[0].vehicle.vehicleType,
            status: driver.vehicleAllocations[0].vehicle.status,
          }
        : null,
    };
  }

  async getByAccountId(accountId: string) {
    const driver = await prisma.driver.findUnique({ where: { accountId } });
    if (!driver) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Driver profile not found");
    return driverDto(driver);
  }

  async create(
    data: { accountId: string; contactPhone: string; licenseNumber?: string | null; licenseExpiry?: Date | null; qualification?: string | null; driverCode?: string },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const account = await prisma.user.findUnique({ where: { id: data.accountId } });
    if (!account) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Linked user account not found");

    const existing = await prisma.driver.findUnique({ where: { accountId: data.accountId } });
    if (existing) throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Driver profile already exists for this account");

    const code = data.driverCode ?? (await this.generateDriverCode());

    if (!isValidLicense(data.licenseExpiry ?? null)) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "License expiry must be in the future");
    }

    const driver = await prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          accountId: data.accountId,
          driverCode: code,
          contactPhone: data.contactPhone,
          licenseNumber: data.licenseNumber ?? null,
          licenseExpiry: data.licenseExpiry ?? null,
          qualification: data.qualification ?? null,
          active: true,
          state: "Offline",
        },
      });
      await tx.driverAvailabilityHistory.create({
        data: { driverId: created.id, previousState: "Offline", newState: "Offline", reasonCode: "PROFILE_CREATED", actorId },
      });
      await writeAudit({ actorId, actorType: "user", action: "driver.created", resourceType: "driver", resourceId: created.id, after: { driverCode: created.driverCode, accountId: created.accountId }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return created;
    });

    return driverDto(driver);
  }

  private async generateDriverCode(): Promise<string> {
    const count = await prisma.driver.count();
    return `DRV${String(count + 1).padStart(5, "0")}`;
  }

  async update(
    id: string,
    data: { contactPhone?: string; licenseNumber?: string | null; licenseExpiry?: Date | null; qualification?: string | null; active?: boolean; version?: number },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const before = await prisma.driver.findUnique({ where: { id } });
    if (!before) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Driver not found");
    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    if (data.licenseExpiry !== undefined && !isValidLicense(data.licenseExpiry)) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "License expiry must be in the future");
    }
    if (data.active === false && before.active) {
      const openWork = await prisma.deliveryAssignment.count({
        where: { driverId: id, status: { in: ["Offered", "Accepted"] } },
      });
      if (openWork > 0) {
        throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver has open offers or accepted assignments and cannot be deactivated");
      }
    }

    const updateData: Record<string, unknown> = { version: { increment: 1 } };
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.licenseExpiry !== undefined) updateData.licenseExpiry = data.licenseExpiry;
    if (data.qualification !== undefined) updateData.qualification = data.qualification;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.driver.update({ where: { id }, data: updateData });
      await writeAudit({ actorId, actorType: "user", action: "driver.updated", resourceType: "driver", resourceId: id,
        before: { active: before.active, state: before.state, licenseExpiry: before.licenseExpiry },
        after: { active: result.active, licenseExpiry: result.licenseExpiry }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return result;
    });
    return driverDto(updated);
  }

  async setAvailability(
    driverId: string,
    state: "Offline" | "Available" | "Unavailable",
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Driver not found");
    if (!driver.active) throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Inactive drivers cannot change availability");

    const openReservation = await prisma.deliveryAssignment.count({
      where: { driverId, status: { in: ["Offered", "Accepted"] } },
    });
    const backendStates = new Set(["Assigned", "OnDelivery"]);
    const currentBackendControlled = backendStates.has(driver.state);

    if (state === "Available" && currentBackendControlled) {
      throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver state is currently controlled by backend workflow");
    }
    if (openReservation > 0 && state !== "Unavailable") {
      throw new AppError(409, ErrorCodes.ASSIGNMENT_CONFLICT, "Driver has open reservations; cannot change to this state");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const previousState = driver.state;
      const result = await tx.driver.update({ where: { id: driverId }, data: { state } });
      if (previousState !== state) {
        await tx.driverAvailabilityHistory.create({
          data: {
            driverId,
            previousState: previousState as DriverAvailabilityState,
            newState: state,
            reasonCode: "SELF_SERVICE",
            actorId,
          },
        });
      }
      await writeAudit({ actorId, actorType: "user", action: "driver.availability_changed", resourceType: "driver", resourceId: driverId,
        before: { state: previousState }, after: { state }, requestId: meta.requestId ?? null, ip: meta.ip ?? null }, tx);
      return result;
    });
    return driverDto(updated);
  }

  async listAssignments(driverId: string) {
    const assignments = await prisma.deliveryAssignment.findMany({
      where: { driverId, status: { in: ["Offered", "Accepted"] } },
      include: { order: { include: { items: true } } },
      orderBy: { offeredAt: "desc" },
    });
    return assignments.map((a) => ({
      id: a.id,
      status: a.status,
      offerExpiresAt: a.offerExpiresAt,
      offeredAt: a.offeredAt,
      order: {
        id: a.order.id,
        orderNumber: a.order.orderNumber,
        status: a.order.status,
        pickupAddress: a.order.pickupAddress,
        deliveryAddress: a.order.deliveryAddress,
      },
    }));
  }
}