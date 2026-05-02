import { z } from 'zod';

export const provisionDeviceSchema = z.object({
  vehicle_id: z.string().uuid(),
  // If true, any existing active device on the same vehicle is revoked first.
  // Defaults to false — provisioning a second device on a vehicle with an
  // active one returns 409, forcing the operator to be explicit.
  revoke_existing: z.boolean().optional().default(false),
});

export const listDeviceQuerySchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  station_id: z.string().uuid().optional(),
  district: z.string().max(8).optional(),
  province: z.string().max(8).optional(),
  status: z.enum(['active', 'revoked']).optional(),
  sort: z.string().max(120).optional(),
  fields: z.string().max(240).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
