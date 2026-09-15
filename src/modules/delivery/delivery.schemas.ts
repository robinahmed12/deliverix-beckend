import { z } from "zod";

export const pickupSchema = z.object({});

export const failOrderSchema = z.object({
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().min(1).max(500).optional().or(z.literal(null)),
});

export const retryDeliverySchema = z.object({
  reasonCode: z.string().min(1).max(100).optional().or(z.literal(null)),
  reasonText: z.string().max(500).optional().or(z.literal(null)),
});

export const rescheduleOrderSchema = z.object({
  rescheduledAtStart: z.coerce.date(),
  rescheduledAtEnd: z.coerce.date(),
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().min(1).max(500).optional().or(z.literal(null)),
});

export const startReturnSchema = z.object({
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().min(1).max(500).optional().or(z.literal(null)),
});

export const returnProofSchema = z.object({
  fileId: z.string().cuid(),
  note: z.string().max(500).optional().or(z.literal(null)),
});

export const confirmReturnSchema = z.object({});

export const confirmPickupReceiptSchema = z.object({
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().min(1).max(500).optional().or(z.literal(null)),
});

export const attemptsQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});