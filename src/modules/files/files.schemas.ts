import { z } from "zod";

export const signedUrlQuerySchema = z.object({});

export const scanResultSchema = z.object({
  status: z.enum(["Accepted", "Rejected", "FailedProcessing"]),
  scanResult: z.string().max(200).optional().or(z.literal(null)),
});