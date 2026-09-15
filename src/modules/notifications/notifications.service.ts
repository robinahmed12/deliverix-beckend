import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import { Prisma } from "../../generated/prisma/client.js";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface NotificationInput {
  userId: string;
  orderId?: string | null;
  type: string;
  title: string;
  message: string;
  channel?: "InApp" | "Email";
  payload?: Record<string, unknown>;
}

export class NotificationsService {
  async list(
    params: { cursor?: string; pageSize: number; unreadOnly?: boolean },
    userId: string,
  ) {
    const cursorObj = params.cursor ? decodeCursor<{ id: string }>(params.cursor) : undefined;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(params.unreadOnly ? { readAt: null } : {}),
      ...(cursorObj ? { id: { gt: cursorObj.id } } : {}),
    };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where: { userId, ...(params.unreadOnly ? { readAt: null } : {}) } }),
      prisma.notification.findMany({
        where,
        take: params.pageSize + 1,
        orderBy: { id: "asc" },
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          channel: true,
          payload: true,
          readAt: true,
          orderId: true,
          createdAt: true,
        },
      }),
    ]);

    const hasMore = notifications.length > params.pageSize;
    const page = hasMore ? notifications.slice(0, params.pageSize) : notifications;
    const last = page.at(-1);

    return {
      data: page,
      meta: {
        nextCursor: last ? encodeCursor({ id: last.id }) : null,
        hasMore,
        pageSize: params.pageSize,
        total,
      },
    };
  }

  async markRead(id: string, userId: string) {
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Notification not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      await writeAudit({ actorId: userId, actorType: "user", action: "notification.read", resourceType: "notification", resourceId: id, requestId: null, ip: null }, tx);
      return result;
    });

    return { id: updated.id, readAt: updated.readAt };
  }

  async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async create(input: NotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        orderId: input.orderId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        channel: input.channel ?? "InApp",
        payload: input.payload ? (input.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: input.channel ?? "InApp",
        status: "Pending",
        attempts: 0,
      },
    });

    return notification;
  }

  async createFromOutbox(
    tx: Tx,
    event: { id: string; eventType: string; aggregateType: string; aggregateId: string; payload: Prisma.JsonValue },
    target: { userId: string; orderId: string | null; type: string; title: string; message: string },
  ): Promise<{ id: string } | null> {
    const payloadData = (event.payload ?? {}) as Record<string, unknown>;

    const existing = await tx.notification.findFirst({
      where: {
        userId: target.userId,
        type: target.type,
        ...(target.orderId ? { orderId: target.orderId } : {}),
        payload: { path: ["outboxEventId"], equals: event.id },
      },
    });
    if (existing) return null;

    const notification = await tx.notification.create({
      data: {
        userId: target.userId,
        orderId: target.orderId,
        type: target.type,
        title: target.title,
        message: target.message,
        channel: "InApp",
        payload: {
          outboxEventId: event.id,
          ...payloadData,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: "InApp",
        status: "Pending",
        attempts: 0,
      },
    });

    return { id: notification.id };
  }
}