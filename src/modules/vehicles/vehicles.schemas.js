import { z } from 'zod';

const PLATE_RE = /^[A-Z]{2,3}-(?:[A-Z]{1,2}-)?[0-9]{4}$/;

export const createVehicleSchema = z.object({
  plate_no: z.string().regex(PLATE_RE, 'Invalid plate number format'),
  owner_name: z.string().min(2).max(120),
  owner_nic: z.string().max(16).optional(),
  owner_phone: z.string().max(24).optional(),
  station_id: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'impounded']).default('active'),
});

export const updateVehicleSchema = z
  .object({
    owner_name: z.string().min(2).max(120),
    owner_nic: z.string().max(16),
    owner_phone: z.string().max(24),
    station_id: z.string().uuid(),
    status: z.enum(['active', 'inactive', 'impounded']),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listVehicleQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'impounded']).optional(),
  station_id: z.string().uuid().optional(),
  district: z.string().max(8).optional(),
  province: z.string().max(8).optional(),
  q: z.string().max(64).optional(),
  sort: z.string().max(120).optional(),
  fields: z.string().max(240).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
