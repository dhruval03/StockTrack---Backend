import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getOverviewAnalytics,
  getSalesTrend,
  getTopProducts,
  getCategoryBreakdown,
  getInventoryAnalysis,
  getCustomerInsights,
  getRecentActivity,
  getCompleteAnalytics
} from '../controllers/analytics.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get complete analytics in one call (recommended for better performance)
router.get('/analytics/complete', authorizeRoles('ADMIN', 'MANAGER'), getCompleteAnalytics);

// Individual analytics endpoints
router.get('/analytics/overview', authorizeRoles('ADMIN', 'MANAGER'), getOverviewAnalytics);
router.get('/analytics/sales-trend', authorizeRoles('ADMIN', 'MANAGER'), getSalesTrend);
router.get('/analytics/top-products', authorizeRoles('ADMIN', 'MANAGER'), getTopProducts);
router.get('/analytics/category-breakdown', authorizeRoles('ADMIN', 'MANAGER'), getCategoryBreakdown);
router.get('/analytics/inventory-analysis', authorizeRoles('ADMIN', 'MANAGER'), getInventoryAnalysis);
router.get('/analytics/customer-insights', authorizeRoles('ADMIN', 'MANAGER'), getCustomerInsights);
router.get('/analytics/recent-activity', authorizeRoles('ADMIN', 'MANAGER'), getRecentActivity);

export default router;