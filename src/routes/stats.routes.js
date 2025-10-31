import express from 'express';
import {
  getTeamStats,
  getWarehouseStats,
  getRecentActivity,
  getManagersList,
  getManagerStaff,
  createUser,
  updateUser,
  deleteUser,
  getUserById
} from '../controllers/stats.controller.js';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All routes require authentication and MANAGER or ADMIN role
router.use(protect);
router.use(authorizeRoles('MANAGER', 'ADMIN'));

// Stats endpoints
router.get('/stats/team', getTeamStats);
router.get('/stats/warehouse', getWarehouseStats);
router.get('/stats/recent-activity', getRecentActivity);
router.get('/stats/managers', getManagersList);
router.get('/stats/manager/:managerId/staff', getManagerStaff);

// User management endpoints (for managers to manage their team)
router.get('/users/:userId', getUserById);
router.post('/users', createUser);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

export default router;