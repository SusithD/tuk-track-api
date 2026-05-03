import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser, requireDevice } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './tracking.controller.js';

export const deviceRouter = Router();
export const userRouter = Router();

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

export const vehicleSubRoutes = Router({ mergeParams: true });
vehicleSubRoutes.use(requireUser, privateNoStore);
vehicleSubRoutes.get('/:id/location', ctrl.lastKnown);
vehicleSubRoutes.get('/:id/history', ctrl.history);
