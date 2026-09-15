import { z } from "zod";

export const listServiceTypesQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

export const createServiceTypeSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(30),
  description: z.string().max(500).optional().or(z.literal(null)),
  active: z.coerce.boolean().optional(),
});

export const updateServiceTypeSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional().or(z.literal(null)),
  active: z.coerce.boolean().optional(),
});