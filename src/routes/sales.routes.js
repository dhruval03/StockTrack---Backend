import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  createSale,
  getAllSales,
  getSaleById,
  getSalesStats,
  cancelSale
} from '../controllers/sales.controller.js';

const router = express.Router();

console.log('🔵 Sales routes file loaded');

// All routes require authentication
router.use(protect);

// IMPORTANT: Specific routes MUST come before parameterized routes
router.get('/stats/summary', getSalesStats);
router.get('/all', getAllSales);
router.post('/create', authorizeRoles('STAFF', 'MANAGER', 'ADMIN'), createSale);
router.get('/:id', getSaleById);
router.patch('/:id/cancel', authorizeRoles('ADMIN', 'MANAGER'), cancelSale);

export default router;