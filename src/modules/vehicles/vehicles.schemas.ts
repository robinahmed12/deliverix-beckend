import { z } from "zod";

export const listVehiclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["Active", "Maintenance", "Inactive"]).optional(),
  search: z.string().max(100).optional(),
});

export const createVehicleSchema = z.object({
  registrationNumber: z.string().min(1).max(30),
  make: z.string().max(100).optional().or(z.literal(null)),
  model: z.string().max(100).optional().or(z.literal(null)),
  vehicleType: z.string().min(1).max(50),
  capacityValue: z.coerce.number().positive(),
  capacityUnit: z.string().min(1).max(20),
  qualification: z.string().max(50).optional().or(z.literal(null)),
});

export const updateVehicleSchema = z.object({
  make: z.string().max(100).optional().or(z.literal(null)),
  model: z.string().max(100).optional().or(z.literal(null)),
  vehicleType: z.string().max(50).optional(),
  capacityValue: z.coerce.number().positive().optional(),
  capacityUnit: z.string().max(20).optional(),
  qualification: z.string().max(50).optional().or(z.literal(null)),
  status: z.enum(["Active", "Maintenance", "Inactive"]).optional(),
});

export const allocateVehicleSchema = z.object({
  driverId: z.string().cuid(),
  reasonCode: z.string().max(100).optional().or(z.literal(null)),
});