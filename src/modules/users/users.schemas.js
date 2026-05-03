import { z } from 'zod';

const baseUserBody = {
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
  full_name: z.string().min(2).max(120),
};

export const createUserSchema = z
  .object({
    ...baseUserBody,
    role: z.enum(['hq', 'province', 'station']),
    province_id: z.string().uuid().optional(),
    station_id: z.string().uuid().optional(),
    status: z.enum(['active', 'disabled']).default('active'),
  })
  .superRefine((val, ctx) => {
    if (val.role === 'hq' && (val.province_id || val.station_id)) {
      ctx.addIssue({ code: 'custom', message: 'HQ users must not have province_id or station_id' });
    }
    if (val.role === 'province') {
      if (!val.province_id) {
        ctx.addIssue({ code: 'custom', message: 'province users require province_id' });
      }
      if (val.station_id) {
        ctx.addIssue({ code: 'custom', message: 'province users must not have station_id' });
      }
    }
    if (val.role === 'station' && (!val.province_id || !val.station_id)) {
      ctx.addIssue({
        code: 'custom',
        message: 'station users require both province_id and station_id',
      });
    }
  });

export const listUserQuerySchema = z.object({
  role: z.enum(['hq', 'province', 'station']).optional(),
  province_id: z.string().uuid().optional(),
  station_id: z.string().uuid().optional(),
  status: z.enum(['active', 'disabled']).optional(),
  q: z.string().max(64).optional(),
  sort: z.string().max(120).optional(),
  fields: z.string().max(240).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
