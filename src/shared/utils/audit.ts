import { prisma } from "./prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

export interface AuditEntry {
  actorId?: string | null;
  actorType: "user" | "system" | "api";
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  ip?: string | null;
  result?: "success" | "failure";
}

function toJson(
  value: Record<string, unknown> | null,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

export async function writeAudit(
  entry: AuditEntry,
  tx: { auditLog: typeof prisma.auditLog } = prisma,
): Promise<void> {
  const data: {
    actorId: string | null;
    actorType: string;
    action: string;
    resourceType: string;
    resourceId: string;
    reason: string | null;
    requestId: string | null;
    ip: string | null;
    result: string;
    before?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
    after?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  } = {
    actorId: entry.actorId ?? null,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    reason: entry.reason ?? null,
    requestId: entry.requestId ?? null,
    ip: entry.ip ?? null,
    result: entry.result ?? "success",
  };

  if (entry.before !== undefined) {
    data.before = toJson(entry.before);
  }
  if (entry.after !== undefined) {
    data.after = toJson(entry.after);
  }

  await tx.auditLog.create({ data: data as never });
}