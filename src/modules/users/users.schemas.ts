import { z } from "zod";

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["Active", "Invited", "Suspended", "Inactive"]).optional(),
  role: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  roleIds: z.array(z.string().cuid()).min(1),
  phone: z.string().max(30).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().or(z.literal(null)),
  status: z.enum(["Active", "Suspended", "Inactive"]).optional(),
});

export const setUserRolesSchema = z.object({
  roleIds: z.array(z.string().cuid()).min(1),
});