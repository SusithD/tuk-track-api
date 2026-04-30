import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const logoutSchema = refreshSchema;
