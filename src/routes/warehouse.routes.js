import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getAllWarehouses,
  getWarehouseById,
  addWarehouse,
  updateWarehouse,
  toggleWarehouseStatus,
  deleteWarehouse,
  assignUsersToWarehouse,
  removeUserFromWarehouse
} from '../controllers/warehouse.controller.js';

const router = express.Router();

// All warehouse routes are protected and only accessible by ADMIN
router.use(protect, authorizeRoles('ADMIN', 'MANAGER'));

router.get('/warehouse/all', getAllWarehouses);
router.get('/warehouse/:id', getWarehouseById);
router.post('/warehouse/add', addWarehouse);
router.put('/warehouse/:id', updateWarehouse);
router.patch('/warehouse/:id/status', toggleWarehouseStatus);
router.delete('/warehouse/:id', deleteWarehouse);

// Assign/Remove users to/from warehouse
router.post('/warehouse/:id/assign-users', assignUsersToWarehouse);
router.delete('/warehouse/user/:userId/remove', removeUserFromWarehouse);

export default router;