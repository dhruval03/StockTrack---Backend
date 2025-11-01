// controllers/staff.controller.js
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get inventory for staff's assigned warehouse
export const getMyWarehouseInventory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user with their warehouse
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        warehouse: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.warehouseId) {
      return res.status(400).json({ 
        message: 'You are not assigned to any warehouse. Please contact admin.' 
      });
    }

    // Fetch inventory for staff's warehouse
    const inventory = await prisma.warehouseInventory.findMany({
      where: {
        warehouseId: user.warehouseId,
        inventory: {
          status: true, // Only active products
        },
      },
      include: {
        inventory: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        inventory: {
          name: 'asc',
        },
      },
    });

    // Transform data
    const transformedInventory = inventory.map(item => ({
      id: item.inventory.id,
      name: item.inventory.name,
      brand: item.inventory.brand || 'Generic',
      sku: item.inventory.sku,
      description: item.inventory.description,
      categoryId: item.inventory.categoryId,
      categoryName: item.inventory.category?.name,
      unit: item.inventory.unit,
      purchasePrice: parseFloat(item.inventory.purchasePrice),
      sellingPrice: parseFloat(item.inventory.sellingPrice),
      color: item.inventory.color,
      storage: item.inventory.storage,
      ram: item.inventory.ram,
      size: item.inventory.size,
      capacity: item.inventory.capacity,
      stock: item.quantity,
      warehouseInventoryId: item.id,
      warehouseId: item.warehouseId,
      warehouseName: user.warehouse.name,
      warehouseLocation: user.warehouse.location,
    }));

    res.status(200).json({
      warehouse: {
        id: user.warehouse.id,
        name: user.warehouse.name,
        location: user.warehouse.location,
      },
      inventory: transformedInventory,
    });
  } catch (err) {
    console.error('Get staff inventory error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch inventory', 
      error: err.message 
    });
  }
};

// Get staff's warehouse info
export const getMyWarehouse = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        warehouse: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.warehouseId) {
      return res.status(404).json({ 
        message: 'You are not assigned to any warehouse' 
      });
    }

    res.status(200).json(user.warehouse);
  } catch (err) {
    console.error('Get staff warehouse error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch warehouse', 
      error: err.message 
    });
  }
};