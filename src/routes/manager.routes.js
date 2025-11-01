// routes/manager.routes.js
import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getMyTeam,
  getMyWarehouses,
  getDashboardStats,
  getTeamPerformance,
  getWeeklyTrends,
  getPendingTransfers,
  getRecentActivities,
  getLowStockAlerts
} from '../controllers/manager.controller.js';

const router = express.Router();

console.log('🔵 Manager routes file loaded');

// All routes require authentication and MANAGER/ADMIN role
router.use(protect);
router.use(authorizeRoles('MANAGER', 'ADMIN'));

// Team management
router.get('/team', getMyTeam);
router.get('/team/performance', getTeamPerformance);

// Warehouse management
router.get('/warehouses', getMyWarehouses);

// Dashboard statistics
router.get('/dashboard/stats', getDashboardStats);
router.get('/trends/weekly', getWeeklyTrends);

// Operations
router.get('/transfers/pending', getPendingTransfers);
router.get('/activities/recent', getRecentActivities);
router.get('/inventory/low-stock', getLowStockAlerts);

export default router;