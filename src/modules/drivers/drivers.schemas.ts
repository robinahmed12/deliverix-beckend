import { z } from "zod";

export const listDriversQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  state: z.enum(["Offline", "Available", "Assigned", "OnDelivery", "Unavailable"]).optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

export const createDriverSchema = z.object({
  accountId: z.string().cuid(),
  contactPhone: z.string().min(1).max(30),
  licenseNumber: z.string().max(50).optional().or(z.literal(null)),
  licenseExpiry: z.coerce.date().optional().or(z.literal(null)),
  qualification: z.string().max(50).optional().or(z.literal(null)),
  driverCode: z.string().min(1).max(30).optional(),
});

export const updateDriverSchema = z.object({
  contactPhone: z.string().max(30).optional(),
  licenseNumber: z.string().max(50).optional().or(z.literal(null)),
  licenseExpiry: z.coerce.date().optional().or(z.literal(null)),
  qualification: z.string().max(50).optional().or(z.literal(null)),
  active: z.coerce.boolean().optional(),
});

export const setAvailabilitySchema = z.object({
  state: z.enum(["Offline", "Available", "Unavailable"]),
});