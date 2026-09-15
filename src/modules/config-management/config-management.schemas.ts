import { z } from "zod";

export const createFailureReasonSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  requiresText: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

export const updateFailureReasonSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  requiresText: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

export const createProofPolicySchema = z.object({
  policyVersion: z.string().min(1).max(50),
  requiresRecipientName: z.coerce.boolean().optional(),
  requiresPhoto: z.coerce.boolean().optional(),
  requiresSignature: z.coerce.boolean().optional(),
  requiresConfirmation: z.coerce.boolean().optional(),
  requiresOtp: z.coerce.boolean().optional(),
  minPhotos: z.coerce.number().int().min(0).optional(),
});

export const updateProofPolicySchema = z.object({
  active: z.coerce.boolean(),
});

export const updateSettingSchema = z.object({
  value: z.unknown(),
});

export const listConfigQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
});