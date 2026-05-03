import { z } from 'zod';

export const listDriverQuerySchema = z.object({
  station_id: z.string().uuid().optional(),
  district: z.string().max(8).optional(),
  province: z.string().max(8).optional(),
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const NIC_RE = /^([0-9]{9}[VvXx]|[0-9]{12})$/;
export const nicParamSchema = z
  .string()
  .regex(NIC_RE, 'Invalid NIC format (expected 9 digits + V/X or 12 digits)');
