import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true });

const FUTURE_SKEW_SEC = 120;
const PAST_AGE_DAYS = 30;

const isPlausibleRecordedAt = (val) => {
  const t = new Date(val).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t <= now + FUTURE_SKEW_SEC * 1000 && t >= now - PAST_AGE_DAYS * 86_400_000;
};

const singlePing = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  speed_kmh: z.number().gte(0).lte(220).optional().nullable(),
  heading_deg: z.number().gte(0).lt(360).optional().nullable(),
  recorded_at: isoDate.refine(isPlausibleRecordedAt, {
    message: 'recorded_at must be within ±2min future and 30 days past',
  }),
});

/** Accepts either a single ping body or `{ pings: [...] }` for batch upload. */
export const pingPayloadSchema = z.union([
  singlePing,
  z.object({ pings: z.array(singlePing).min(1).max(100) }),
]);

export const historyQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.from && val.to) {
      const from = new Date(val.from).getTime();
      const to = new Date(val.to).getTime();
      if (to <= from) {
        ctx.addIssue({ code: 'custom', message: 'to must be greater than from', path: ['to'] });
      }
      const span = to - from;
      const sevenDaysMs = 7 * 86_400_000;
      if (span > sevenDaysMs) {
        ctx.addIssue({
          code: 'custom',
          message: 'history window may not exceed 7 days',
          path: ['to'],
        });
      }
    }
  });

export const opsListQuerySchema = z.object({
  province: z.string().max(8).optional(),
  district: z.string().max(8).optional(),
  station_id: z.string().uuid().optional(),
  since: isoDate.optional(),
  status: z.enum(['fresh', 'stale', 'any']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
