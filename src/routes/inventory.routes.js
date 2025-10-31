import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getAllInventories,
  getInventoryById,
  addInventory,
  updateInventory,
  toggleInventoryStatus,
  deleteInventory,
  assignInventoryToWarehouse,
  adjustInventoryQuantity,
  getInventoryByWarehouse,
  getLowStockAlerts,
  getInventoryValueSummary,
  getWarehouseValueSummary
} from '../controllers/inventory.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// All authenticated users can view inventories
router.get('/inventory/all', getAllInventories);
router.get('/inventory/:id', getInventoryById);
router.get('/inventory/warehouse/:warehouseId', getInventoryByWarehouse);
router.get('/inventory/alerts/low-stock', getLowStockAlerts);

// Value summaries - Admin and Manager can view
router.get('/inventory/summary/value', authorizeRoles('ADMIN', 'MANAGER'), getInventoryValueSummary);
router.get('/inventory/warehouse/:warehouseId/value', authorizeRoles('ADMIN', 'MANAGER'), getWarehouseValueSummary);

// Only admin can manage inventories
router.post('/inventory/add', authorizeRoles('ADMIN'), addInventory);
router.put('/inventory/:id', authorizeRoles('ADMIN'), updateInventory);
router.patch('/inventory/:id/status', authorizeRoles('ADMIN'), toggleInventoryStatus);
router.delete('/inventory/:id', authorizeRoles('ADMIN'), deleteInventory);

// Only admin can assign/adjust inventory
router.post('/inventory/assign', authorizeRoles('ADMIN'), assignInventoryToWarehouse);
router.post('/inventory/adjust', authorizeRoles('ADMIN'), adjustInventoryQuantity);

export default router;