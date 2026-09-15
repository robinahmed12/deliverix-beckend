import { z } from "zod";

const addressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().or(z.literal(null)),
  city: z.string().min(1).max(100),
  region: z.string().max(100).optional().or(z.literal(null)),
  postalCode: z.string().max(30).optional().or(z.literal(null)),
  country: z.string().min(1).max(100),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal(null)),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal(null)),
  contactName: z.string().max(150).optional().or(z.literal(null)),
  contactPhone: z.string().max(30).optional().or(z.literal(null)),
});

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().or(z.literal(null)),
  quantity: z.coerce.number().int().positive().default(1),
  weight: z.coerce.number().positive().optional().or(z.literal(null)),
  weightUnit: z.string().max(20).optional().or(z.literal(null)),
  lengthCm: z.coerce.number().positive().optional().or(z.literal(null)),
  widthCm: z.coerce.number().positive().optional().or(z.literal(null)),
  heightCm: z.coerce.number().positive().optional().or(z.literal(null)),
});

export const createOrderSchema = z.object({
  customerId: z.string().cuid(),
  pickupAddress: addressSchema,
  deliveryAddress: addressSchema,
  pickupInstructions: z.string().max(1000).optional().or(z.literal(null)),
  deliveryInstructions: z.string().max(1000).optional().or(z.literal(null)),
  promisedAtStart: z.coerce.date().optional().or(z.literal(null)),
  promisedAtEnd: z.coerce.date().optional().or(z.literal(null)),
  zoneId: z.string().cuid().optional(),
  serviceTypeId: z.string().cuid().optional(),
  currencyCode: z.string().length(3).default("USD"),
  deliveryFeeOverride: z.coerce.number().positive().optional().or(z.literal(null)),
  feeOverrideReason: z.string().max(200).optional().or(z.literal(null)),
  packageNote: z.string().max(1000).optional().or(z.literal(null)),
  items: z.array(itemSchema).min(1),
});

export const updateOrderSchema = z.object({
  pickupAddress: addressSchema.optional(),
  deliveryAddress: addressSchema.optional(),
  pickupInstructions: z.string().max(1000).optional().or(z.literal(null)),
  deliveryInstructions: z.string().max(1000).optional().or(z.literal(null)),
  promisedAtStart: z.coerce.date().optional().or(z.literal(null)),
  promisedAtEnd: z.coerce.date().optional().or(z.literal(null)),
  packageNote: z.string().max(1000).optional().or(z.literal(null)),
  items: z.array(itemSchema).min(1).optional(),
});

export const cancelOrderSchema = z.object({
  reasonCode: z.string().min(1).max(100),
  reasonText: z.string().max(500).optional().or(z.literal(null)),
});

export const listOrdersQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum([
    "Pending",
    "ReadyForPickup",
    "Assigned",
    "PickedUp",
    "InTransit",
    "OutForDelivery",
    "Failed",
    "ReturnInProgress",
    "Delivered",
    "Cancelled",
    "Returned",
  ]).optional(),
  customerId: z.string().cuid().optional(),
  search: z.string().max(100).optional(),
});

export const createNoteSchema = z.object({
  note: z.string().min(1).max(3000),
});

export const listNotesQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});