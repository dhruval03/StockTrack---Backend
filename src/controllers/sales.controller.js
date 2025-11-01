// controllers/sales.controller.js
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

const createExpenseEntry = async (data, tx = prisma) => {
  const { title, category, amount, type, date, description, reference, userId } = data;
  
  return await tx.expense.create({
    data: {
      title,
      category,
      amount,
      type,
      date: date || new Date(),
      description,
      reference,
      status: 'COMPLETED',
      createdById: userId
    }
  });
};

// Generate expense reference
const generateExpenseReference = async (type, tx = prisma) => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  const prefix = type === 'INCOME' ? 'INC' : 'EXP';
  const count = await tx.expense.count({
    where: {
      reference: { startsWith: `${prefix}-${dateStr}` }
    }
  });
  
  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${sequence}`;
};

// Generate unique sale number
const generateSaleNumber = async () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  
  const todaySalesCount = await prisma.sale.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });
  
  const sequence = String(todaySalesCount + 1).padStart(4, '0');
  return `SALE-${dateStr}-${sequence}`;
};

// Create a new sale
export const createSale = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      warehouseId,
      items, // [{ inventoryId, quantity, unitPrice, totalPrice }]
      subtotal,
      discount,
      discountType,
      discountValue,
      tax,
      total,
      paymentMethod,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      remarks,
    } = req.body;

    // Validation
    if (!warehouseId) {
      return res.status(400).json({ message: 'Warehouse ID is required' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Sale must have at least one item' });
    }

    // Verify user has access to this warehouse
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, role: true },
    });

    // Staff can only make sales for their assigned warehouse
    if (user.role === 'STAFF' && user.warehouseId !== warehouseId) {
      return res.status(403).json({ 
        message: 'You can only make sales for your assigned warehouse' 
      });
    }

    // Verify warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Check stock availability for all items
    for (const item of items) {
      const warehouseInventory = await prisma.warehouseInventory.findFirst({
        where: {
          warehouseId: warehouseId,
          inventoryId: item.inventoryId,
        },
      });

      if (!warehouseInventory) {
        const inventory = await prisma.inventory.findUnique({
          where: { id: item.inventoryId },
        });
        return res.status(400).json({ 
          message: `Product "${inventory?.name || 'Unknown'}" is not available in this warehouse` 
        });
      }

      if (warehouseInventory.quantity < item.quantity) {
        const inventory = await prisma.inventory.findUnique({
          where: { id: item.inventoryId },
        });
        return res.status(400).json({ 
          message: `Insufficient stock for "${inventory?.name || 'Unknown'}". Available: ${warehouseInventory.quantity}, Requested: ${item.quantity}` 
        });
      }
    }

    // Generate sale number
    const saleNumber = await generateSaleNumber();

    // Create sale with transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create sale
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          warehouseId,
          subtotal,
          discount,
          discountType: discountType.toUpperCase(),
          discountValue,
          tax,
          total,
          paymentMethod: paymentMethod.toUpperCase(),
          paymentStatus: 'COMPLETED',
          customerName,
          customerPhone,
          customerEmail,
          customerAddress,
          remarks,
          status: 'COMPLETED',
          createdById: userId,
        },
      });

      // Create sale items and update inventory
      for (const item of items) {
        // Create sale item
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            inventoryId: item.inventoryId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          },
        });

        // Update warehouse inventory
        const warehouseInventory = await tx.warehouseInventory.findFirst({
          where: {
            warehouseId: warehouseId,
            inventoryId: item.inventoryId,
          },
        });

        const newQuantity = warehouseInventory.quantity - item.quantity;

        await tx.warehouseInventory.update({
          where: { id: warehouseInventory.id },
          data: { quantity: newQuantity },
        });

        // Create inventory log
        await tx.inventoryLog.create({
          data: {
            inventoryId: item.inventoryId,
            warehouseId: warehouseId,
            action: 'SALE',
            quantity: item.quantity,
            previousQty: warehouseInventory.quantity,
            newQty: newQuantity,
            remarks: `Sale: ${saleNumber}`,
            userId: userId,
          },
        });
      }

      // Fetch complete sale with items
      const completeSale = await tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: {
            include: {
              inventory: {
                select: {
                  name: true,
                  sku: true,
                  unit: true,
                },
              },
            },
          },
          warehouse: {
            select: {
              name: true,
              location: true,
            },
          },
          createdBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return completeSale;
    });

    res.status(201).json({
      message: 'Sale completed successfully',
      sale: result,
    });
  } catch (err) {
    console.error('Create sale error:', err);
    res.status(500).json({ 
      message: 'Failed to create sale', 
      error: err.message 
    });
  }
};

// Get all sales with filters
export const getAllSales = async (req, res) => {
  try {
    const userId = req.user.id;
    const { warehouseId, startDate, endDate, status } = req.query;

    // Build where clause
    const where = {};

    // Staff can only see sales from their warehouse
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, role: true },
    });

    if (user.role === 'STAFF') {
      where.warehouseId = user.warehouseId;
    } else if (warehouseId) {
      where.warehouseId = parseInt(warehouseId);
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            inventory: {
              select: {
                name: true,
                sku: true,
              },
            },
          },
        },
        warehouse: {
          select: {
            name: true,
            location: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json(sales);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch sales', 
      error: err.message 
    });
  }
};

// Get sale by ID
export const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            inventory: true,
          },
        },
        warehouse: true,
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Check access for staff
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, role: true },
    });

    if (user.role === 'STAFF' && sale.warehouseId !== user.warehouseId) {
      return res.status(403).json({ 
        message: 'You can only view sales from your warehouse' 
      });
    }

    res.status(200).json(sale);
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch sale', 
      error: err.message 
    });
  }
};

// Get sales statistics
export const getSalesStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { warehouseId, startDate, endDate } = req.query;

    // Build where clause
    const where = { status: 'COMPLETED' };

    // Staff can only see stats from their warehouse
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, role: true },
    });

    if (user.role === 'STAFF') {
      where.warehouseId = user.warehouseId;
    } else if (warehouseId) {
      where.warehouseId = parseInt(warehouseId);
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get aggregated stats
    const stats = await prisma.sale.aggregate({
      where,
      _count: { id: true },
      _sum: {
        total: true,
        subtotal: true,
        discount: true,
        tax: true,
      },
    });

    // Get total items sold
    const itemsStats = await prisma.saleItem.aggregate({
      where: {
        sale: where,
      },
      _sum: {
        quantity: true,
      },
    });

    res.status(200).json({
      totalSales: stats._count.id || 0,
      totalRevenue: parseFloat(stats._sum.total || 0),
      totalSubtotal: parseFloat(stats._sum.subtotal || 0),
      totalDiscount: parseFloat(stats._sum.discount || 0),
      totalTax: parseFloat(stats._sum.tax || 0),
      totalItemsSold: itemsStats._sum.quantity || 0,
    });
  } catch (err) {
    console.error('Get sales stats error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch sales statistics', 
      error: err.message 
    });
  }
};

// Cancel sale (Admin/Manager only)
export const cancelSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    // Check if user is admin or manager
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user.role === 'STAFF') {
      return res.status(403).json({ 
        message: 'Only admins and managers can cancel sales' 
      });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: true,
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Sale is already cancelled' });
    }

    // Revert inventory in transaction
    await prisma.$transaction(async (tx) => {
      // Update sale status
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'CANCELLED',
          remarks: `${sale.remarks || ''}\nCancelled: ${reason || 'No reason provided'}`,
        },
      });

      // Restore inventory for each item
      for (const item of sale.items) {
        const warehouseInventory = await tx.warehouseInventory.findFirst({
          where: {
            warehouseId: sale.warehouseId,
            inventoryId: item.inventoryId,
          },
        });

        if (warehouseInventory) {
          const newQuantity = warehouseInventory.quantity + item.quantity;

          await tx.warehouseInventory.update({
            where: { id: warehouseInventory.id },
            data: { quantity: newQuantity },
          });

          // Create inventory log
          await tx.inventoryLog.create({
            data: {
              inventoryId: item.inventoryId,
              warehouseId: sale.warehouseId,
              action: 'ADJUSTMENT',
              quantity: item.quantity,
              previousQty: warehouseInventory.quantity,
              newQty: newQuantity,
              remarks: `Sale cancelled: ${sale.saleNumber}`,
              userId: userId,
            },
          });
        }
      }
    });

    res.status(200).json({
      message: 'Sale cancelled successfully',
    });
  } catch (err) {
    console.error('Cancel sale error:', err);
    res.status(500).json({ 
      message: 'Failed to cancel sale', 
      error: err.message 
    });
  }
};