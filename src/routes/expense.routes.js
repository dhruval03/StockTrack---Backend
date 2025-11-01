// routes/expense.routes.js
import express from 'express';
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getFinancialSummary,
  getCategoryBreakdown
} from '../controllers/expense.controller.js';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all expenses (with filters)
router.get('/', getAllExpenses);

// Get financial summary
router.get('/summary', getFinancialSummary);

// Get category breakdown
router.get('/breakdown', getCategoryBreakdown);

// Get single expense
router.get('/:id', getExpenseById);

// Create expense (Admin and Manager only)
router.post('/', authorizeRoles('ADMIN', 'MANAGER'), createExpense);

// Update expense (Admin and Manager only)
router.put('/:id', authorizeRoles('ADMIN', 'MANAGER'), updateExpense);

// Delete expense (Admin only)
router.delete('/:id', authorizeRoles('ADMIN'), deleteExpense);

export default router;

// Add this to your main app.js or server.js:
// import expenseRoutes from './routes/expense.routes.js';
// app.use('/api/expenses', expenseRoutes);