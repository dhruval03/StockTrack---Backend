import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all categories
export const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { inventories: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single category
export const getCategoryById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: {
        inventories: true,
        _count: {
          select: { inventories: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add category (Admin only)
export const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: 'Category name already exists' });
    }

    const category = await prisma.category.create({
      data: { name, description },
    });

    res.status(201).json({ message: 'Category created', category });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update category (Admin only)
export const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { name, description },
    });

    res.json({ message: 'Category updated', category });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Category name already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(500).json({ message: 'Error updating category', error: err.message });
  }
};

// Toggle category status (Admin only)
export const toggleCategoryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json({ message: `Category ${status ? 'activated' : 'deactivated'}`, category });
  } catch (err) {
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// Delete category (Admin only)
export const deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if category has inventories
    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: { _count: { select: { inventories: true } } }
    });

    if (category && category._count.inventories > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with assigned inventories. Please reassign inventories first.' 
      });
    }

    await prisma.category.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(500).json({ message: 'Error deleting category', error: err.message });
  }
};