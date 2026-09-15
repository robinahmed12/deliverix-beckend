import { z } from "zod";

export const listZonesQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

export const createZoneSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(30),
  active: z.coerce.boolean().optional(),
  priority: z.coerce.number().int().min(0).optional(),
  deliveryFee: z.coerce.number().positive().optional().or(z.literal(null)),
  currencyCode: z.string().length(3).default("USD"),
  areas: z.array(z.object({
    name: z.string().max(100).optional().or(z.literal(null)),
    latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal(null)),
    longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal(null)),
    radiusMeters: z.coerce.number().positive().optional().or(z.literal(null)),
    polygon: z.unknown().optional().or(z.literal(null)),
    active: z.coerce.boolean().optional(),
  })).optional(),
});

export const updateZoneSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  active: z.coerce.boolean().optional(),
  priority: z.coerce.number().int().min(0).optional(),
  deliveryFee: z.coerce.number().positive().optional().or(z.literal(null)),
});