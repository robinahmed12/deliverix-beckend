import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});