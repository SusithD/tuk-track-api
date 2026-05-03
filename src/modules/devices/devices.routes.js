import { Router } from 'express';
import { requireUser, requireRole } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './devices.controller.js';

const router = Router();

router.use(requireUser, privateNoStore);

router.post('/', requireRole('hq', 'station'), ctrl.provision);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

export default router;
