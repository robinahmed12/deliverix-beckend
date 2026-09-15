import { z } from "zod";

export const auditLogQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  actorId: z.string().min(1).max(128).optional(),
  action: z.string().min(1).max(200).optional(),
  resourceType: z.string().min(1).max(100).optional(),
  resourceId: z.string().min(1).max(128).optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;