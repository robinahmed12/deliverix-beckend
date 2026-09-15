import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal(null)),
  phone: z.string().max(30).optional().or(z.literal(null)),
  status: z.enum(["active", "inactive"]).optional(),
});

export const createAddressSchema = z.object({
  label: z.string().max(100).optional(),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().or(z.literal(null)),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional().or(z.literal(null)),
  postalCode: z.string().max(30).optional().or(z.literal(null)),
  country: z.string().min(1).max(100).default("US"),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal(null)),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal(null)),
  isDefault: z.coerce.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const addressParamsSchema = z.object({
  customerId: z.string().cuid(),
  addressId: z.string().cuid().optional(),
});