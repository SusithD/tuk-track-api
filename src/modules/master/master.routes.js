import { Router } from 'express';
import { requireUser } from '../../middleware/auth.js';
import { publicCache } from '../../utils/cache-headers.js';
import * as ctrl from './master.controller.js';

const router = Router();

const cacheable = publicCache(300);

router.get('/provinces', requireUser, cacheable, ctrl.listProvinces);
router.get('/provinces/:id', requireUser, cacheable, ctrl.getProvince);

router.get('/districts', requireUser, cacheable, ctrl.listDistricts);
router.get('/districts/:id', requireUser, cacheable, ctrl.getDistrict);

router.get('/stations', requireUser, cacheable, ctrl.listStations);
router.get('/stations/:id', requireUser, cacheable, ctrl.getStation);

export default router;
