import { z } from "zod";

export const submitProofSchema = z.discriminatedUnion("evidenceType", [
  z.object({
    evidenceType: z.literal("RecipientName"),
    evidenceValue: z.string().min(1).max(200),
  }),
  z.object({
    evidenceType: z.literal("Photo"),
    fileIds: z.array(z.string().cuid()).min(1).max(5),
  }),
  z.object({
    evidenceType: z.literal("Signature"),
    fileIds: z.array(z.string().cuid()).min(1).max(1),
  }),
  z.object({
    evidenceType: z.literal("ConfirmationFlag"),
    confirmationFlag: z.literal(true),
  }),
  z.object({
    evidenceType: z.literal("Otp"),
    evidenceValue: z.string().min(4).max(10),
  }),
]);

export const listProofsQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});