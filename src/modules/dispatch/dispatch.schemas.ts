import { z } from "zod";

export const createAssignmentSchema = z.object({
  driverId: z.string().cuid(),
  offerExpiresAt: z.coerce.date().optional().or(z.literal(null)),
});

export const reassignSchema = z.object({
  driverId: z.string().cuid(),
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().max(500).optional().or(z.literal(null)),
  offerExpiresAt: z.coerce.date().optional().or(z.literal(null)),
});

export const cancelSchema = z.object({
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().max(500).optional().or(z.literal(null)),
});

export const dispatchQueueQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  zoneId: z.string().cuid().optional(),
});

export const workloadQuerySchema = z.object({
  state: z.enum(["Available", "Assigned", "OnDelivery", "Offline", "Unavailable"]).optional(),
});