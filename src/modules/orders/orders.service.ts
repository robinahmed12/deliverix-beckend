import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { generateOrderNumber } from "./order-number.service.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CANCELLABLE_STATES = new Set(["Pending", "ReadyForPickup"]);

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

function orderDto(order: Record<string, unknown>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerId: order.customerId,
    serviceTypeId: order.serviceTypeId,
    zoneId: order.zoneId,
    pickupAddress: order.pickupAddress,
    deliveryAddress: order.deliveryAddress,
    pickupInstructions: order.pickupInstructions,
    deliveryInstructions: order.deliveryInstructions,
    promisedAtStart: order.promisedAtStart,
    promisedAtEnd: order.promisedAtEnd,
    deliveryFee: order.deliveryFee,
    currencyCode: order.currencyCode,
    packageNote: order.packageNote,
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    failedAt: order.failedAt,
    returnedAt: order.returnedAt,
    items: (order as { items?: Array<Record<string, unknown>> }).items ?? [],
    version: order.version,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export class OrdersService {
  async create(
    data: {
      customerId: string;
      pickupAddress: Record<string, unknown>;
      deliveryAddress: Record<string, unknown>;
      pickupInstructions?: string | null;
      deliveryInstructions?: string | null;
      promisedAtStart?: Date | null;
      promisedAtEnd?: Date | null;
      zoneId?: string;
      serviceTypeId?: string;
      currencyCode: string;
      deliveryFeeOverride?: number | null;
      feeOverrideReason?: string | null;
      packageNote?: string | null;
      items: Array<{
        name: string;
        description?: string | null;
        quantity: number;
        weight?: number | null;
        weightUnit?: string | null;
        lengthCm?: number | null;
        widthCm?: number | null;
        heightCm?: number | null;
      }>;
    },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Customer not found");
    }

    let zone = null;
    if (data.zoneId) {
      zone = await prisma.deliveryZone.findFirst({ where: { id: data.zoneId, active: true } });
      if (!zone) {
        throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Delivery zone is not available");
      }
    }

    let serviceType = null;
    if (data.serviceTypeId) {
      serviceType = await prisma.serviceType.findFirst({ where: { id: data.serviceTypeId, active: true } });
      if (!serviceType) {
        throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Service type is not available");
      }
    }

    let deliveryFee: number | null = null;
    if (data.deliveryFeeOverride !== undefined && data.deliveryFeeOverride !== null) {
      if (!data.feeOverrideReason) {
        throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Fee override requires a reason");
      }
      deliveryFee = data.deliveryFeeOverride;
    } else {
      deliveryFee = zone?.deliveryFee !== null && zone?.deliveryFee !== undefined
        ? Number(zone.deliveryFee)
        : null;
    }

    if (data.promisedAtStart && data.promisedAtEnd && data.promisedAtStart > data.promisedAtEnd) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Promised window start cannot be after end");
    }

    const orderNumber = generateOrderNumber();

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryOrder.create({
        data: {
          orderNumber,
          status: "Pending",
          customerId: data.customerId,
          serviceTypeId: data.serviceTypeId ?? null,
          zoneId: data.zoneId ?? null,
          createdById: actorId,
          pickupAddress: data.pickupAddress as unknown as Prisma.InputJsonValue,
          deliveryAddress: data.deliveryAddress as unknown as Prisma.InputJsonValue,
          pickupInstructions: data.pickupInstructions ?? null,
          deliveryInstructions: data.deliveryInstructions ?? null,
          promisedAtStart: data.promisedAtStart ?? null,
          promisedAtEnd: data.promisedAtEnd ?? null,
          deliveryFee,
          currencyCode: data.currencyCode,
          packageNote: data.packageNote ?? null,
          items: {
            create: data.items.map((item) => ({
              name: item.name,
              description: item.description ?? null,
              quantity: item.quantity,
              weight: item.weight ?? null,
              weightUnit: item.weightUnit ?? null,
              lengthCm: item.lengthCm ?? null,
              widthCm: item.widthCm ?? null,
              heightCm: item.heightCm ?? null,
            })),
          },
        },
        include: { items: true },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: "Pending",
          toStatus: "Pending",
          actorId: actorId,
          actorType: "user",
          reasonCode: "ORDER_CREATED",
          requestId: meta.requestId ?? null,
          version: 1,
        },
      });

      await emitOutbox(tx, {
        eventType: "order.created",
        aggregateType: "order",
        aggregateId: created.id,
        payload: { orderId: created.id, orderNumber, customerId: data.customerId },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "order.created",
          resourceType: "order",
          resourceId: created.id,
          after: { orderNumber, customerId: data.customerId, deliveryFee },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return created;
    });

    return orderDto(order as unknown as Record<string, unknown>);
  }

  private async scopeWhere(auth: { userId: string; roles: string[] }) {
    const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
    if (isStaff) {
      return {};
    }
    const customer = await prisma.customer.findUnique({ where: { accountId: auth.userId } });
    if (!customer) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, "No customer account linked");
    }
    return { customerId: customer.id };
  }

  async list(
    params: { cursor?: string; pageSize: number; status?: string; customerId?: string; search?: string },
    auth: { userId: string; roles: string[] },
  ) {
    const scope = await this.scopeWhere(auth);

    const where: Prisma.DeliveryOrderWhereInput = { ...scope };
    const authIsCustomer = !auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
    if (!authIsCustomer && params.customerId) {
      where.customerId = params.customerId;
    }
    if (params.status) {
      where.status = params.status as never;
    }
    if (params.search) {
      where.OR = [{ orderNumber: { contains: params.search, mode: "insensitive" } }];
    }

    const cursorObj = params.cursor ? decodeCursor<{ id: string }>(params.cursor) : undefined;
    if (cursorObj) {
      where.id = { gt: cursorObj.id };
    }

    const orders = await prisma.deliveryOrder.findMany({
      where,
      take: params.pageSize + 1,
      orderBy: { id: "asc" },
      include: { items: true },
    });

    const hasMore = orders.length > params.pageSize;
    const pageOrders = hasMore ? orders.slice(0, params.pageSize) : orders;
    const last = pageOrders[pageOrders.length - 1];

    return {
      data: pageOrders.map((o) => orderDto(o as unknown as Record<string, unknown>)),
      meta: {
        nextCursor: last ? encodeCursor({ id: last.id }) : null,
        hasMore,
        pageSize: params.pageSize,
      },
    };
  }

  async getById(id: string, auth: { userId: string; roles: string[] }) {
    const order = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }

    const isStaff = auth.roles.some((r) => ["admin", "dispatcher", "support"].includes(r));
    if (!isStaff) {
      const customer = await prisma.customer.findUnique({ where: { accountId: auth.userId } });
      if (!customer || customer.id !== order.customerId) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, "Access denied to this order");
      }
    }

    return orderDto(order as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: {
      pickupAddress?: Record<string, unknown>;
      deliveryAddress?: Record<string, unknown>;
      pickupInstructions?: string | null;
      deliveryInstructions?: string | null;
      promisedAtStart?: Date | null;
      promisedAtEnd?: Date | null;
      packageNote?: string | null;
      items?: Array<Record<string, unknown>>;
      version?: number;
    },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const before = await prisma.deliveryOrder.findUnique({ where: { id }, include: { items: true } });
    if (!before) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }

    if (before.status !== "Pending" && before.status !== "ReadyForPickup") {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order can only be edited in Pending or ReadyForPickup");
    }

    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const concrete: {
      pickupAddress?: Prisma.InputJsonValue;
      deliveryAddress?: Prisma.InputJsonValue;
      pickupInstructions?: string | null;
      deliveryInstructions?: string | null;
      promisedAtStart?: Date | null;
      promisedAtEnd?: Date | null;
      packageNote?: string | null;
    } = {};

    if (data.pickupAddress) concrete.pickupAddress = data.pickupAddress as Prisma.InputJsonValue;
    if (data.deliveryAddress) concrete.deliveryAddress = data.deliveryAddress as Prisma.InputJsonValue;
    if (data.pickupInstructions !== undefined) concrete.pickupInstructions = data.pickupInstructions;
    if (data.deliveryInstructions !== undefined) concrete.deliveryInstructions = data.deliveryInstructions;
    if (data.promisedAtStart !== undefined) concrete.promisedAtStart = data.promisedAtStart;
    if (data.promisedAtEnd !== undefined) concrete.promisedAtEnd = data.promisedAtEnd;
    if (data.packageNote !== undefined) concrete.packageNote = data.packageNote;

    const order = await prisma.$transaction(async (tx) => {
      let updated;
      if (Object.keys(concrete).length > 0) {
        updated = await tx.deliveryOrder.update({
          where: { id },
          data: { ...concrete, version: { increment: 1 } },
          include: { items: true },
        });
      } else {
        updated = await tx.deliveryOrder.update({
          where: { id },
          data: { version: { increment: 1 } },
          include: { items: true },
        });
      }

      if (data.items) {
        await tx.deliveryItem.deleteMany({ where: { orderId: id } });
        await tx.deliveryItem.createMany({
          data: data.items.map((item) => ({
            orderId: id,
            name: String(item.name),
            description: (item.description as string | null) ?? null,
            quantity: Number(item.quantity ?? 1),
            weight: item.weight ? Number(item.weight) : null,
            weightUnit: (item.weightUnit as string | null) ?? null,
            lengthCm: item.lengthCm ? Number(item.lengthCm) : null,
            widthCm: item.widthCm ? Number(item.widthCm) : null,
            heightCm: item.heightCm ? Number(item.heightCm) : null,
          })),
        });
        updated = await tx.deliveryOrder.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });
      }

      await emitOutbox(tx, {
        eventType: "order.updated",
        aggregateType: "order",
        aggregateId: id,
        payload: { orderId: id },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "order.updated",
          resourceType: "order",
          resourceId: id,
          before: {
            status: before.status,
            pickupInstructions: before.pickupInstructions,
            deliveryInstructions: before.deliveryInstructions,
          },
          after: { status: updated.status },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return updated;
    });

    return orderDto(order as unknown as Record<string, unknown>);
  }

  async markReady(id: string, actorId: string, meta: { requestId?: string; ip?: string }) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }

    if (order.status !== "Pending") {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Only Pending orders can be marked ready");
    }

    const invalidReasons: string[] = [];

    const zone = order.zoneId
      ? await prisma.deliveryZone.findFirst({ where: { id: order.zoneId, active: true } })
      : null;
    const service = order.serviceTypeId
      ? await prisma.serviceType.findFirst({ where: { id: order.serviceTypeId, active: true } })
      : null;
    const proofPolicy = order.proofPolicyId
      ? await prisma.proofPolicyVersion.findFirst({ where: { id: order.proofPolicyId, active: true } })
      : null;

    if (order.zoneId && !zone) invalidReasons.push("delivery zone is deactivated or missing");
    if (order.serviceTypeId && !service) invalidReasons.push("service type is deactivated or missing");
    if (order.proofPolicyId && !proofPolicy) invalidReasons.push("proof policy is deactivated or missing");
    if (!order.deliveryAddress) invalidReasons.push("delivery address is missing");
    if (!order.pickupAddress) invalidReasons.push("pickup address is missing");
    if (order.items.length === 0) invalidReasons.push("no package items");

    if (invalidReasons.length > 0) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, `Order not ready: ${invalidReasons.join("; ")}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.deliveryOrder.update({
        where: { id },
        data: { status: "ReadyForPickup", readyAt: new Date(), version: { increment: 1 } },
        include: { items: true },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: "ReadyForPickup",
          actorId,
          actorType: "user",
          reasonCode: "READY",
          requestId: meta.requestId ?? null,
          version: result.version,
        },
      });

      await emitOutbox(tx, {
        eventType: "order.ready",
        aggregateType: "order",
        aggregateId: id,
        payload: { orderId: id },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "order.marked_ready",
          resourceType: "order",
          resourceId: id,
          before: { status: order.status },
          after: { status: "ReadyForPickup" },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return result;
    });

    return orderDto(updated as unknown as Record<string, unknown>);
  }

  async cancel(
    id: string,
    data: { reasonCode: string; reasonText?: string | null },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }

    if (!CANCELLABLE_STATES.has(order.status)) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "Order cannot be cancelled in its current state");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const openAssignments = await tx.deliveryAssignment.findMany({
        where: { orderId: id, status: { in: ["Offered", "Accepted"] } },
      });

      if (openAssignments.length > 0) {
        await tx.deliveryAssignment.updateMany({
          where: { orderId: id, status: { in: ["Offered", "Accepted"] } },
          data: { status: "Released", withdrawnAt: new Date(), reasonCode: "ORDER_CANCELLED" },
        });
      }

      const result = await tx.deliveryOrder.update({
        where: { id },
        data: { status: "Cancelled", cancelledAt: new Date(), version: { increment: 1 } },
        include: { items: true },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: "Cancelled",
          actorId,
          actorType: "user",
          reasonCode: data.reasonCode,
          reasonText: data.reasonText ?? null,
          requestId: meta.requestId ?? null,
          version: result.version,
        },
      });

      await emitOutbox(tx, {
        eventType: "order.cancelled",
        aggregateType: "order",
        aggregateId: id,
        payload: { orderId: id, reasonCode: data.reasonCode },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "order.cancelled",
          resourceType: "order",
          resourceId: id,
          before: { status: order.status },
          after: { status: "Cancelled", reasonCode: data.reasonCode },
          reason: data.reasonCode,
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return result;
    });

    return orderDto(updated as unknown as Record<string, unknown>);
  }

  async getHistory(id: string, auth: { userId: string; roles: string[] }) {
    await this.getById(id, auth);

    const history = await prisma.deliveryStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });

    return history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reasonCode: h.reasonCode,
      reasonText: h.reasonText,
      actorType: h.actorType,
      version: h.version,
      createdAt: h.createdAt,
    }));
  }

  async listNotes(id: string, params: { cursor?: string; pageSize: number }, auth: { userId: string; roles: string[] }) {
    await this.getById(id, auth);

    const cursorObj = params.cursor ? decodeCursor<{ id: string }>(params.cursor) : undefined;
    const notes = await prisma.internalNote.findMany({
      where: { orderId: id, ...(cursorObj ? { id: { gt: cursorObj.id } } : {}) },
      take: params.pageSize + 1,
      orderBy: { id: "asc" },
    });

    const hasMore = notes.length > params.pageSize;
    const pageNotes = hasMore ? notes.slice(0, params.pageSize) : notes;
    const last = pageNotes[pageNotes.length - 1];

    return {
      data: pageNotes.map((n) => ({ id: n.id, body: n.body, authorId: n.authorId, createdAt: n.createdAt })),
      meta: { nextCursor: last ? encodeCursor({ id: last.id }) : null, hasMore, pageSize: params.pageSize },
    };
  }

  async createNote(id: string, body: string, actorId: string, meta: { requestId?: string; ip?: string }) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Order not found");
    }

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.internalNote.create({
        data: { orderId: id, authorId: actorId, body },
      });
      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "order.note_added",
          resourceType: "internalNote",
          resourceId: created.id,
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );
      return created;
    });

    return { id: note.id, body: note.body, authorId: note.authorId, createdAt: note.createdAt };
  }
}