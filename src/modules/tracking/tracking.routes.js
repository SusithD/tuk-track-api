import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser, requireDevice } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './tracking.controller.js';

/**
 * Two routers exported from this module:
 *  - deviceRouter is mounted under `/api/v1/devices` and authenticates
 *    incoming pings via HMAC.
 *  - userRouter is mounted under `/api/v1` and serves human consumers
 *    of location data (live view + cross-fleet ops view).
 */

export const deviceRouter = Router();
export const userRouter = Router();

// Generous per-device rate limit — busses ping every minute, but a misbehaving
// device should not be able to flood the ingest path.
const deviceLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.header('x-key-id') || req.ip,
  message: { error: { code: 'RATE_LIMITED', message: 'Device ping rate exceeded' } },
});

deviceRouter.post('/pings', deviceLimiter, requireDevice, privateNoStore, ctrl.ingest);

userRouter.use(requireUser, privateNoStore);
userRouter.get('/locations', ctrl.opsList);

// Per-vehicle endpoints get re-exported so the vehicle router can mount them
// at /api/v1/vehicles/:id/... without a circular import.
export const vehicleSubRoutes = Router({ mergeParams: true });
vehicleSubRoutes.use(requireUser, privateNoStore);
vehicleSubRoutes.get('/:id/location', ctrl.lastKnown);
vehicleSubRoutes.get('/:id/history', ctrl.history);
