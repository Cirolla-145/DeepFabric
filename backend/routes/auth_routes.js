import { Router } from 'express';
import { signup, login, logout, getCurrentUser } from '../controllers/auth_controllers.js';
import protectRoute from '../middleware/protectRoute.js';

const router = Router();
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protectRoute, getCurrentUser);
export default router;
