import { Router } from 'express';
import { requireUser } from '../../middleware/auth.js';
import { privateNoStore } from '../../utils/cache-headers.js';
import * as ctrl from './drivers.controller.js';

const router = Router();

router.use(requireUser, privateNoStore);
router.get('/', ctrl.list);
router.get('/:nic', ctrl.getByNic);

export default router;
