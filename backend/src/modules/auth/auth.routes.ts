import { Router } from 'express';
import { login, logout, changePasswordHandler, me } from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login',           loginLimiter, login);
router.post('/logout',          authenticate, logout);
router.post('/change-password', authenticate, changePasswordHandler);
router.get ('/me',              authenticate, me);

export default router;
