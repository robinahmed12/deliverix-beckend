import { z } from "zod";

export const listRolesQuerySchema = z.object({
  user: z.string().cuid().optional(),
});