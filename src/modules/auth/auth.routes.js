import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser } from '../../middleware/auth.js';
import { login, refresh, logout, me } from './auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' },
  },
});

router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireUser, me);

export default router;
