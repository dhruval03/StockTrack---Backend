// routes/staff.routes.js
import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import { 
  getMyWarehouseInventory, 
  getMyWarehouse 
} from '../controllers/staff.controller.js';

const router = express.Router();

// All routes require staff authentication
router.use(protect);
router.use(authorizeRoles('STAFF', 'MANAGER', 'ADMIN'));

// Get staff's warehouse
router.get('/my-warehouse', getMyWarehouse);

// Get inventory for staff's warehouse
router.get('/my-inventory', getMyWarehouseInventory);

export default router;