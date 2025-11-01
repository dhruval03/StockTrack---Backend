// controllers/expense.controller.js
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Generate unique reference number
const generateReference = async (type) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  const prefix = type === 'INCOME' ? 'INC' : 'EXP';
  const count = await prisma.expense.count({
    where: {
      reference: { startsWith: `${prefix}-${dateStr}` }
    }
  });
  
  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${sequence}`;
};

// Get all expenses with filters
export const getAllExpenses = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      type, 
      dateFilter,
      startDate,
      endDate 
    } = req.query;

    const where = {};

    // Search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Category filter
    if (category && category !== 'ALL') {
      where.category = category;
    }

    // Type filter
    if (type && type !== 'ALL') {
      where.type = type.toUpperCase();
    }

    // Date filter
    if (dateFilter && dateFilter !== 'ALL') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      switch (dateFilter) {
        case 'TODAY':
          where.date = {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          };
          break;
        case 'WEEK':
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          where.date = { gte: weekAgo };
          break;
        case 'MONTH':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          where.date = { gte: monthStart };
          break;
      }
    }

    // Custom date range
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.status(200).json(expenses);
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch expenses', 
      error: err.message 
    });
  }
};

// Get expense by ID
export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!expense) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.status(200).json(expense);
  } catch (err) {
    console.error('Get expense error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch transaction', 
      error: err.message 
    });
  }
};

// Create new expense
export const createExpense = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      category,
      amount,
      type,
      date,
      description,
      reference
    } = req.body;

    // Validation
    if (!title || !category || !amount || !type || !date) {
      return res.status(400).json({ 
        message: 'Title, category, amount, type, and date are required' 
      });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Generate reference if not provided
    const finalReference = reference || await generateReference(type.toUpperCase());

    const expense = await prisma.expense.create({
      data: {
        title,
        category: category.toUpperCase(),
        amount: parseFloat(amount),
        type: type.toUpperCase(),
        date: new Date(date),
        description,
        reference: finalReference,
        status: 'COMPLETED',
        createdById: userId
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Transaction created successfully',
      expense
    });
  } catch (err) {
    console.error('Create expense error:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Reference number already exists' });
    }
    res.status(500).json({ 
      message: 'Failed to create transaction', 
      error: err.message 
    });
  }
};

// Update expense
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      category,
      amount,
      type,
      date,
      description,
      reference,
      status
    } = req.body;

    // Check if expense exists
    const existing = await prisma.expense.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Validation
    if (amount !== undefined && parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (category !== undefined) updateData.category = category.toUpperCase();
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (type !== undefined) updateData.type = type.toUpperCase();
    if (date !== undefined) updateData.date = new Date(date);
    if (description !== undefined) updateData.description = description;
    if (reference !== undefined) updateData.reference = reference;
    if (status !== undefined) updateData.status = status.toUpperCase();

    const expense = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(200).json({
      message: 'Transaction updated successfully',
      expense
    });
  } catch (err) {
    console.error('Update expense error:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Reference number already exists' });
    }
    res.status(500).json({ 
      message: 'Failed to update transaction', 
      error: err.message 
    });
  }
};

// Delete expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.expense.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await prisma.expense.delete({
      where: { id: parseInt(id) }
    });

    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ 
      message: 'Failed to delete transaction', 
      error: err.message 
    });
  }
};

// Get financial summary
export const getFinancialSummary = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;

    const where = {};

    // Date filter
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Category filter
    if (category && category !== 'ALL') {
      where.category = category;
    }

    // Get income summary
    const incomeResult = await prisma.expense.aggregate({
      where: { ...where, type: 'INCOME' },
      _sum: { amount: true },
      _count: true
    });

    // Get expense summary
    const expenseResult = await prisma.expense.aggregate({
      where: { ...where, type: 'EXPENSE' },
      _sum: { amount: true },
      _count: true
    });

    // Get monthly expenses
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const monthlyExpenseResult = await prisma.expense.aggregate({
      where: {
        type: 'EXPENSE',
        date: { gte: currentMonth }
      },
      _sum: { amount: true }
    });

    const totalIncome = parseFloat(incomeResult._sum.amount || 0);
    const totalExpenses = parseFloat(expenseResult._sum.amount || 0);
    const balance = totalIncome - totalExpenses;
    const monthlyExpenses = parseFloat(monthlyExpenseResult._sum.amount || 0);

    res.status(200).json({
      totalIncome,
      totalExpenses,
      balance,
      monthlyExpenses,
      incomeCount: incomeResult._count,
      expenseCount: expenseResult._count
    });
  } catch (err) {
    console.error('Get summary error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch financial summary', 
      error: err.message 
    });
  }
};

// Get category breakdown
export const getCategoryBreakdown = async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;

    const where = {};

    // Date filter
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Type filter
    if (type && type !== 'ALL') {
      where.type = type.toUpperCase();
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: {
        category: true,
        amount: true,
        type: true
      }
    });

    // Group by category
    const breakdown = {};
    expenses.forEach(exp => {
      if (!breakdown[exp.category]) {
        breakdown[exp.category] = {
          category: exp.category,
          amount: 0,
          count: 0
        };
      }
      breakdown[exp.category].amount += parseFloat(exp.amount);
      breakdown[exp.category].count += 1;
    });

    const result = Object.values(breakdown).sort((a, b) => b.amount - a.amount);

    res.status(200).json(result);
  } catch (err) {
    console.error('Get breakdown error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch category breakdown', 
      error: err.message 
    });
  }
};