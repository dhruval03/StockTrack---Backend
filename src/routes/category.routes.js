import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import {
  getAllCategories,
  getCategoryById,
  addCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory
} from '../controllers/category.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// All users can view categories
router.get('/category/all', getAllCategories);
router.get('/category/:id', getCategoryById);

// Only admin can manage categories
router.post('/category/add', authorizeRoles('ADMIN'), addCategory);
router.put('/category/:id', authorizeRoles('ADMIN'), updateCategory);
router.patch('/category/:id/status', authorizeRoles('ADMIN'), toggleCategoryStatus);
router.delete('/category/:id', authorizeRoles('ADMIN'), deleteCategory);

export default router;