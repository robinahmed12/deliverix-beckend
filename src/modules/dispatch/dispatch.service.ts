import { prisma } from "../../shared/utils/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import type { Prisma, DriverAvailabilityState } from "../../generated/prisma/client.js";

export class DispatchService {
  async queue(params: { cursor?: string; pageSize?: number; zoneId?: string }) {
    const pageSize = params.pageSize ?? 20;
    const cursor = params.cursor ? decodeCursor<Record<string, unknown>>(params.cursor) : null;
    const cursorId = cursor && typeof cursor.id === "string" ? cursor.id : undefined;

    const where: Record<string, unknown> = {
      status: "ReadyForPickup",
      assignments: {
        none: { status: { in: ["Offered", "Accepted"] } },
      },
    };
    if (params.zoneId !== undefined) where.zoneId = params.zoneId;
    if (cursorId !== undefined) where.id = { gt: cursorId };

    const orders = await prisma.deliveryOrder.findMany({
      where,
      orderBy: { id: "asc" },
      take: pageSize + 1,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        readyAt: true,
        pickupAddress: true,
        deliveryAddress: true,
        zone: { select: { name: true } },
      },
    });

    const hasMore = orders.length > pageSize;
    const page = orders.slice(0, pageSize);
    const nextCursor = hasMore && page.at(-1) ? encodeCursor({ id: page.at(-1)!.id }) : null;

    return {
      data: page.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        createdAt: o.createdAt,
        readyAt: o.readyAt,
        zoneName: o.zone?.name ?? null,
        pickupAddress: o.pickupAddress,
        deliveryAddress: o.deliveryAddress,
      })),
      pageInfo: { hasMore, nextCursor },
    };
  }

  async workloads(params: { state?: string }) {
    const where: Prisma.DriverWhereInput = { active: true };
    if (params.state !== undefined) {
      where.state = params.state as DriverAvailabilityState;
    }

    const drivers = await prisma.driver.findMany({
      where,
      select: {
        id: true,
        driverCode: true,
        state: true,
        account: { select: { name: true } },
        assignments: {
          where: { status: "Accepted" },
          select: { id: true, orderId: true },
        },
        _count: {
          select: {
            assignments: {
              where: {
                status: "Completed",
                updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
            },
          },
        },
      },
      orderBy: { driverCode: "asc" },
    });

    return {
      data: drivers.map((d) => ({
        id: d.id,
        driverCode: d.driverCode,
        name: d.account.name,
        state: d.state,
        activeAccepted: d.assignments.length,
        completedToday: d._count.assignments,
      })),
    };
  }

  async assignmentHistory(orderId: string) {
    const assignments = await prisma.deliveryAssignment.findMany({
      where: { orderId },
      orderBy: { offeredAt: "asc" },
      select: {
        id: true,
        driver: { select: { driverCode: true } },
        status: true,
        offeredAt: true,
        acceptedAt: true,
        rejectedAt: true,
        withdrawnAt: true,
        releasedAt: true,
        completedAt: true,
        reasonCode: true,
        reasonText: true,
      },
    });
    if (assignments.length === 0) {
      const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }
    return {
      data: assignments.map((a) => ({
        id: a.id,
        driverCode: a.driver.driverCode,
        status: a.status,
        offeredAt: a.offeredAt,
        acceptedAt: a.acceptedAt,
        rejectedAt: a.rejectedAt,
        withdrawnAt: a.withdrawnAt,
        releasedAt: a.releasedAt,
        completedAt: a.completedAt,
        reasonCode: a.reasonCode,
        reasonText: a.reasonText,
      })),
    };
  }
}