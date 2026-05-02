import { Router } from 'express';
import { requireUser, requireRole } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './vehicles.controller.js';

const router = Router();

router.use(requireUser, privateNoStore);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Creation and updates are restricted: HQ + station officers only.
// Province admins are intentionally read-only — they oversee, not register.
router.post('/', requireRole('hq', 'station'), ctrl.create);
router.patch('/:id', requireRole('hq', 'station'), ctrl.update);

export default router;
