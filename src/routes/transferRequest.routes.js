import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getAllTransferRequests,
  getTransferRequestById,
  createTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  cancelTransferRequest,
  getTransferRequestsByWarehouse,
  getTransferRequestStats
} from '../controllers/transferRequest.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Admin and Manager can view transfer requests
router.get('/transfer-request/all', authorizeRoles('ADMIN', 'MANAGER'), getAllTransferRequests);
router.get('/transfer-request/:id', authorizeRoles('ADMIN', 'MANAGER'), getTransferRequestById);
router.get('/transfer-request/warehouse/:warehouseId', authorizeRoles('ADMIN', 'MANAGER'), getTransferRequestsByWarehouse);
router.get('/transfer-request/stats/summary', authorizeRoles('ADMIN', 'MANAGER'), getTransferRequestStats);

// Only Manager can create transfer requests
router.post('/transfer-request/create', authorizeRoles('MANAGER'), createTransferRequest);

// Only Admin can approve/reject transfer requests
router.patch('/transfer-request/:id/approve', authorizeRoles('ADMIN'), approveTransferRequest);
router.patch('/transfer-request/:id/reject', authorizeRoles('ADMIN'), rejectTransferRequest);

// Manager can cancel their own pending requests, Admin can cancel any
router.patch('/transfer-request/:id/cancel', authorizeRoles('ADMIN', 'MANAGER'), cancelTransferRequest);

export default router;