import { prisma } from "../../shared/utils/prisma.js";
import type { Prisma, OrderStatus } from "../../generated/prisma/client.js";
import { METRIC_VERSION } from "./reports.schemas.js";

type OrderStatusGroup = { status: string; count: number };

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function toMinutes(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return Math.round(ms / 60_000);
}

function latenessMinutes(deliveredAt: Date | null, promisedAtEnd: Date | null): number | null {
  if (!deliveredAt || !promisedAtEnd) return null;
  const ms = deliveredAt.getTime() - promisedAtEnd.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 60_000);
}

function isOnTime(deliveredAt: Date | null, promisedAtEnd: Date | null): boolean | null {
  if (!deliveredAt || !promisedAtEnd) return null;
  return deliveredAt.getTime() <= promisedAtEnd.getTime();
}

interface ReportMeta {
  timezone: string;
  dateBasis: string;
  filters: Record<string, unknown>;
  calculatedAt: string;
  metricVersion: string;
}

function meta(input: { timezone: string | undefined; dateBasis: string; filters: Record<string, unknown> }): ReportMeta {
  return {
    timezone: input.timezone ?? "UTC",
    dateBasis: input.dateBasis,
    filters: input.filters,
    calculatedAt: new Date().toISOString(),
    metricVersion: METRIC_VERSION,
  };
}

export class ReportsService {
  async dashboard(params: { date?: string; timezone?: string }) {
    const day = params.date ? new Date(`${params.date}T00:00:00.000Z`) : new Date();
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const [
      deliveriesToday,
      pendingDeliveries,
      activeDeliveries,
      failedToday,
      todayDeliveredOrders,
      driverAvailability,
      statusDistributionRows,
      dayAssignments,
    ] = await Promise.all([
      prisma.deliveryOrder.count({ where: { status: "Delivered", deliveredAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.deliveryOrder.count({ where: { status: { in: ["Pending", "ReadyForPickup"] } } }),
      prisma.deliveryOrder.count({ where: { status: { in: ["Assigned", "PickedUp", "InTransit", "OutForDelivery"] } } }),
      prisma.deliveryOrder.count({ where: { status: "Failed", failedAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.deliveryOrder.findMany({
        where: { status: "Delivered", deliveredAt: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true,
          promisedAtEnd: true,
          pickedUpAt: true,
          deliveredAt: true,
          zoneId: true,
          zone: { select: { id: true, name: true } },
        },
      }),
      prisma.driver.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.deliveryOrder.groupBy({
        by: ["status"],
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _count: { _all: true },
      }),
      prisma.deliveryAssignment.findMany({
        where: { status: "Completed", completedAt: { gte: dayStart, lte: dayEnd } },
        select: {
          driverId: true,
          completedAt: true,
          driver: { select: { id: true, driverCode: true, account: { select: { name: true } } } },
          order: { select: { promisedAtEnd: true, deliveredAt: true, pickedUpAt: true } },
        },
      }),
    ]);

    const onTimeCount = todayDeliveredOrders.filter((o) => isOnTime(o.deliveredAt, o.promisedAtEnd) === true).length;
    const promiseWindowCount = todayDeliveredOrders.filter((o) => o.promisedAtEnd !== null).length;
    const excludedNoPromise = todayDeliveredOrders.length - promiseWindowCount;

    const deliveryTimesMs = todayDeliveredOrders
      .filter((o) => o.pickedUpAt !== null && o.deliveredAt !== null)
      .map((o) => (o.deliveredAt as Date).getTime() - (o.pickedUpAt as Date).getTime());
    const avgDeliveryTimeMs =
      deliveryTimesMs.length > 0 ? deliveryTimesMs.reduce((a, b) => a + b, 0) / deliveryTimesMs.length : null;

    const onTimeRate = ratio(onTimeCount, promiseWindowCount);
    const failedRate = ratio(failedToday, deliveriesToday + failedToday);
    const deliveryRate = ratio(deliveriesToday, deliveriesToday + failedToday);

    const driverStateMap = new Map(driverAvailability.map((d) => [d.state, d._count._all]));
    const driverAvailabilityResult = {
      total: driverAvailability.reduce((a, d) => a + d._count._all, 0),
      available: driverStateMap.get("Available") ?? 0,
      assigned: driverStateMap.get("Assigned") ?? 0,
      onDelivery: driverStateMap.get("OnDelivery") ?? 0,
      offline: driverStateMap.get("Offline") ?? 0,
      unavailable: driverStateMap.get("Unavailable") ?? 0,
    };

    const statusDistribution = statusDistributionRows.map<OrderStatusGroup>((r) => ({
      status: r.status as string,
      count: r._count._all,
    }));

    const driverMap = new Map<string, { id: string; code: string; name: string; deliveries: number; onTime: number }>();
    for (const a of dayAssignments) {
      const entry = driverMap.get(a.driverId) ?? {
        id: a.driverId,
        code: a.driver.driverCode,
        name: a.driver.account.name,
        deliveries: 0,
        onTime: 0,
      };
      entry.deliveries += 1;
      if (isOnTime(a.order.deliveredAt, a.order.promisedAtEnd) === true) entry.onTime += 1;
      driverMap.set(a.driverId, entry);
    }
    const driverPerformance = Array.from(driverMap.values())
      .map((d) => ({
        driverId: d.id,
        driverCode: d.code,
        driverName: d.name,
        deliveries: d.deliveries,
        onTime: d.onTime,
        onTimeRate: ratio(d.onTime, d.deliveries),
      }))
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 10);

    const zoneMap = new Map<string, { id: string; name: string; delivered: number; onTime: number }>();
    for (const o of todayDeliveredOrders) {
      const zoneId = o.zoneId ?? "no-zone";
      const entry = zoneMap.get(zoneId) ?? { id: zoneId, name: o.zone?.name ?? "No zone", delivered: 0, onTime: 0 };
      entry.delivered += 1;
      if (isOnTime(o.deliveredAt, o.promisedAtEnd) === true) entry.onTime += 1;
      zoneMap.set(zoneId, entry);
    }
    const zonePerformance = Array.from(zoneMap.values()).map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      deliveries: z.delivered,
      onTime: z.onTime,
      onTimeRate: ratio(z.onTime, z.delivered),
    }));

    const filters: Record<string, unknown> = { date: params.date ?? day.toISOString().slice(0, 10) };

    return {
      data: {
        date: params.date ?? day.toISOString().slice(0, 10),
        metrics: {
          deliveriesToday,
          failedToday,
          pendingDeliveries,
          activeDeliveries,
          onTimeRate,
          onTimeNumerator: onTimeCount,
          onTimeDenominator: promiseWindowCount,
          excludedNoPromise,
          averageDeliveryTimeMs: avgDeliveryTimeMs,
          deliveryRate,
          failedRate,
          driverAvailability: driverAvailabilityResult,
          statusDistribution,
          driverPerformance,
          zonePerformance,
        },
      },
      meta: meta({ timezone: params.timezone, dateBasis: "deliveredAt/createdAt/state snapshot", filters }),
    };
  }

  async deliveryReport(params: {
    from: Date;
    to: Date;
    zoneId?: string;
    status?: string;
    customerId?: string;
    timezone?: string;
  }) {
    const where: Prisma.DeliveryOrderWhereInput = {
      createdAt: { gte: params.from, lte: params.to },
      ...(params.zoneId ? { zoneId: params.zoneId } : {}),
      ...(params.status ? { status: params.status as OrderStatus } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };

    const orders = await prisma.deliveryOrder.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 1000,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        promisedAtStart: true,
        promisedAtEnd: true,
        rescheduledAtEnd: true,
        pickedUpAt: true,
        deliveredAt: true,
        customerId: true,
        customer: { select: { name: true } },
        zoneId: true,
        zone: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    });

    const rows = orders.map((o) => {
      const onTime = isOnTime(o.deliveredAt, o.promisedAtEnd);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerId: o.customerId,
        customerName: o.customer.name,
        zoneId: o.zoneId,
        zoneName: o.zone?.name ?? null,
        createdAt: o.createdAt.toISOString(),
        promisedAtStart: o.promisedAtStart?.toISOString() ?? null,
        promisedAtEnd: o.promisedAtEnd?.toISOString() ?? null,
        rescheduledAtEnd: o.rescheduledAtEnd?.toISOString() ?? null,
        pickedUpAt: o.pickedUpAt?.toISOString() ?? null,
        deliveredAt: o.deliveredAt?.toISOString() ?? null,
        onTime,
        latenessMinutes: latenessMinutes(o.deliveredAt, o.promisedAtEnd),
        attemptCount: o._count.attempts,
      };
    });

    const deliveredRows = rows.filter((r) => r.deliveredAt !== null && r.promisedAtEnd !== null);
    const deliveredLate = deliveredRows.filter((r) => r.latenessMinutes !== null && r.latenessMinutes > 0).length;
    const onTimeRate = ratio(deliveredRows.length - deliveredLate, deliveredRows.length);

    const filters: Record<string, unknown> = { from: params.from.toISOString(), to: params.to.toISOString() };
    if (params.zoneId) filters.zoneId = params.zoneId;
    if (params.status) filters.status = params.status;
    if (params.customerId) filters.customerId = params.customerId;

    return {
      data: rows,
      summary: {
        totalOrders: rows.length,
        delivered: rows.filter((r) => r.status === "Delivered").length,
        failed: rows.filter((r) => r.status === "Failed").length,
        onTimeRate,
        deliveredLate,
        excludedNoPromise: rows.filter((r) => r.status === "Delivered" && r.promisedAtEnd === null).length,
      },
      meta: meta({ timezone: params.timezone, dateBasis: "createdAt", filters }),
    };
  }

  async driverReport(params: { from: Date; to: Date; driverId?: string; timezone?: string }) {
    const where: Prisma.DeliveryAssignmentWhereInput = {
      createdAt: { gte: params.from, lte: params.to },
      ...(params.driverId ? { driverId: params.driverId } : {}),
    };

    const assignments = await prisma.deliveryAssignment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 2000,
      select: {
        id: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        completedAt: true,
        driverId: true,
        driver: { select: { id: true, driverCode: true, account: { select: { name: true } } } },
        order: { select: { promisedAtEnd: true, deliveredAt: true, pickedUpAt: true, status: true } },
      },
    });

    const driverMap = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        totalAssignments: number;
        accepted: number;
        rejected: number;
        expired: number;
        withdrawn: number;
        completed: number;
        onTime: number;
        deliveryTimesMs: number[];
      }
    >();
    for (const a of assignments) {
      const entry = driverMap.get(a.driverId) ?? {
        id: a.driverId,
        code: a.driver.driverCode,
        name: a.driver.account.name,
        totalAssignments: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        withdrawn: 0,
        completed: 0,
        onTime: 0,
        deliveryTimesMs: [] as number[],
      };
      entry.totalAssignments += 1;
      switch (a.status) {
        case "Accepted":
        case "Completed":
          entry.accepted += 1;
          break;
        case "Rejected":
          entry.rejected += 1;
          break;
        case "Expired":
          entry.expired += 1;
          break;
        case "Withdrawn":
          entry.withdrawn += 1;
          break;
        default:
          break;
      }
      if (a.status === "Completed") {
        entry.completed += 1;
        if (isOnTime(a.order.deliveredAt, a.order.promisedAtEnd) === true) entry.onTime += 1;
        if (a.acceptedAt && a.completedAt) {
          entry.deliveryTimesMs.push(a.completedAt.getTime() - a.acceptedAt.getTime());
        }
      }
      driverMap.set(a.driverId, entry);
    }

    const rows = Array.from(driverMap.values()).map((d) => {
      const avgDeliveryTimeMs =
        d.deliveryTimesMs.length > 0 ? d.deliveryTimesMs.reduce((a, b) => a + b, 0) / d.deliveryTimesMs.length : null;
      return {
        driverId: d.id,
        driverCode: d.code,
        driverName: d.name,
        totalAssignments: d.totalAssignments,
        accepted: d.accepted,
        rejected: d.rejected,
        expired: d.expired,
        withdrawn: d.withdrawn,
        completed: d.completed,
        onTime: d.onTime,
        onTimeRate: ratio(d.onTime, d.completed),
        averageDeliveryTimeMin: toMinutes(avgDeliveryTimeMs),
        rejectionRate: ratio(d.rejected, d.totalAssignments),
      };
    });

    const filters: Record<string, unknown> = { from: params.from.toISOString(), to: params.to.toISOString() };
    if (params.driverId) filters.driverId = params.driverId;

    return {
      data: rows,
      summary: {
        totalDrivers: rows.length,
        totalAssignments: assignments.length,
        completedAssignments: rows.reduce((a, d) => a + d.completed, 0),
      },
      meta: meta({ timezone: params.timezone, dateBasis: "assignment.createdAt", filters }),
    };
  }

  async zoneReport(params: { from: Date; to: Date; zoneId?: string; timezone?: string }) {
    const where: Prisma.DeliveryOrderWhereInput = {
      createdAt: { gte: params.from, lte: params.to },
      ...(params.zoneId ? { zoneId: params.zoneId } : {}),
    };

    const orders = await prisma.deliveryOrder.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 2000,
      select: {
        id: true,
        status: true,
        zoneId: true,
        zone: { select: { id: true, name: true } },
        promisedAtEnd: true,
        pickedUpAt: true,
        deliveredAt: true,
      },
    });

    const zoneMap = new Map<
      string,
      { id: string; name: string; totalOrders: number; delivered: number; failed: number; onTime: number; deliveryTimesMs: number[] }
    >();
    for (const o of orders) {
      const zoneId = o.zoneId ?? "no-zone";
      const entry = zoneMap.get(zoneId) ?? {
        id: zoneId,
        name: o.zone?.name ?? "No zone",
        totalOrders: 0,
        delivered: 0,
        failed: 0,
        onTime: 0,
        deliveryTimesMs: [] as number[],
      };
      entry.totalOrders += 1;
      if (o.status === "Delivered") {
        entry.delivered += 1;
        if (o.pickedUpAt && o.deliveredAt) {
          entry.deliveryTimesMs.push(o.deliveredAt.getTime() - o.pickedUpAt.getTime());
        }
        if (isOnTime(o.deliveredAt, o.promisedAtEnd) === true) entry.onTime += 1;
      } else if (o.status === "Failed") {
        entry.failed += 1;
      }
      zoneMap.set(zoneId, entry);
    }

    const rows = Array.from(zoneMap.values()).map((z) => {
      const avgDeliveryTimeMs =
        z.deliveryTimesMs.length > 0 ? z.deliveryTimesMs.reduce((a, b) => a + b, 0) / z.deliveryTimesMs.length : null;
      return {
        zoneId: z.id === "no-zone" ? null : z.id,
        zoneName: z.name,
        totalOrders: z.totalOrders,
        delivered: z.delivered,
        failed: z.failed,
        onTime: z.onTime,
        onTimeRate: ratio(z.onTime, z.delivered),
        averageDeliveryTimeMin: toMinutes(avgDeliveryTimeMs),
        failedRate: ratio(z.failed, z.delivered + z.failed),
      };
    });

    const filters: Record<string, unknown> = { from: params.from.toISOString(), to: params.to.toISOString() };
    if (params.zoneId) filters.zoneId = params.zoneId;

    return {
      data: rows,
      summary: {
        totalZones: rows.length,
        totalOrders: orders.length,
      },
      meta: meta({ timezone: params.timezone, dateBasis: "order.createdAt", filters }),
    };
  }
}