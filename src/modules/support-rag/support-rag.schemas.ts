import { z } from "zod";

export const chatMessageRoleSchema = z.enum(["user", "assistant", "system"]);

export const chatMessageSchema = z.object({
  role: chatMessageRoleSchema,
  content: z.string().min(1).max(3000),
});

export const supportChatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
  orderId: z.string().cuid().optional(),
});

export const supportFaqQuerySchema = z.object({
  category: z.enum(["tracking", "cancellation", "rescheduling", "failure", "pod", "returns", "general"]).optional(),
  search: z.string().max(100).optional(),
});

export type SupportChatInput = z.infer<typeof supportChatSchema>;
export type SupportFaqQueryInput = z.infer<typeof supportFaqQuerySchema>;
