import { Router } from 'express';
import { requireUser } from '../../middleware/auth.js';
import { publicCache } from '../../utils/cache-headers.js';
import * as ctrl from './master.controller.js';

const router = Router();

// Master data is administrative reference info. We require authentication
// (the API isn't anonymously browsable), but allow shared caches and
// long-ish max-age since it changes very rarely.
const cacheable = publicCache(300); // 5 minutes

router.get('/provinces', requireUser, cacheable, ctrl.listProvinces);
router.get('/provinces/:id', requireUser, cacheable, ctrl.getProvince);

router.get('/districts', requireUser, cacheable, ctrl.listDistricts);
router.get('/districts/:id', requireUser, cacheable, ctrl.getDistrict);

router.get('/stations', requireUser, cacheable, ctrl.listStations);
router.get('/stations/:id', requireUser, cacheable, ctrl.getStation);

export default router;
