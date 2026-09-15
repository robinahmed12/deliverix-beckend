import { prisma } from "../../shared/utils/prisma.js";
import { decodeCursor, encodeCursor } from "../../shared/utils/cursor.js";
import type { Prisma } from "../../generated/prisma/client.js";

type AuditCursor = Record<string, unknown> & { occurredAt: string; id: string };

export class AuditService {
  /**
   * Read-only search over immutable audit records (AUD-001, AUD-004).
   * There is intentionally no create/update/delete surface for audit records.
   */
  async list(params: {
    cursor?: string;
    pageSize: number;
    from?: Date;
    to?: Date;
    actorId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.from || params.to) {
      where.occurredAt = {};
      if (params.from) where.occurredAt.gte = params.from;
      if (params.to) where.occurredAt.lte = params.to;
    }
    if (params.actorId) where.actorId = params.actorId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;

    const cursor = params.cursor ? decodeCursor<AuditCursor>(params.cursor) : null;
    if (cursor) {
      where.OR = [
        { occurredAt: { lt: new Date(cursor.occurredAt) } },
        { occurredAt: new Date(cursor.occurredAt), id: { lt: cursor.id } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take: params.pageSize + 1,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          actorId: true,
          actorType: true,
          action: true,
          resourceType: true,
          resourceId: true,
          before: true,
          after: true,
          reason: true,
          requestId: true,
          ip: true,
          result: true,
          occurredAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = records.length > params.pageSize;
    const page = hasMore ? records.slice(0, params.pageSize) : records;
    const last = page.at(-1);

    return {
      data: page,
      meta: {
        nextCursor: last ? encodeCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id }) : null,
        hasMore,
        pageSize: params.pageSize,
        total,
      },
    };
  }
}