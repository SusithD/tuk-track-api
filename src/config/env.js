import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-please-32chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  CORS_ORIGIN: z.string().default('*'),
  // Public base URL (no trailing slash). Used in OpenAPI server list and
  // anywhere we render absolute links. Render injects RENDER_EXTERNAL_URL
  // automatically; otherwise PUBLIC_URL or the local fallback is used.
  PUBLIC_URL: z.string().url().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** The canonical externally-reachable base URL for this instance. */
export const publicUrl =
  env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT}`;
