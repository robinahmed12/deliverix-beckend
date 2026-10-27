import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().length(6).regex(/^\d+$/),
});

export const refreshSchema = z.object({
  // Optional: browsers (deliverix-web) send the refresh token via the
  // httpOnly `refresh_token` cookie and POST an empty body. Programmatic
  // clients may still send it in the body.
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export const mfaEnrollmentConfirmSchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
});