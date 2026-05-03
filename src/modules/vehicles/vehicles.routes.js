import { Router } from 'express';
import { requireUser, requireRole } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './vehicles.controller.js';
import { vehicleSubRoutes } from '../tracking/tracking.routes.js';

const router = Router();

router.use(requireUser, privateNoStore);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('hq', 'station'), ctrl.create);
router.patch('/:id', requireRole('hq', 'station'), ctrl.update);
router.use('/', vehicleSubRoutes);

export default router;
