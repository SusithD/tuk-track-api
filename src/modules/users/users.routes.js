import { Router } from 'express';
import { requireUser, requireRole } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './users.controller.js';

const router = Router();

router.use(requireUser, privateNoStore);

router.get('/', requireRole('hq', 'province'), ctrl.list);
router.post('/', requireRole('hq'), ctrl.create);

export default router;
