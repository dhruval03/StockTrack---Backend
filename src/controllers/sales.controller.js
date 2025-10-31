import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all sales (All authenticated users)
export const getAllsales = async (req, res) => {
  try {
    const sales = await prisma.sales.findMany({
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        warehousesales: {
          include: {
            warehouse: { select: { id: true, name: true, location: true } }
          }
        },
        _count: {
          select: { warehousesales: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate total quantity and total value across all warehouses
    const salesWithTotal = sales.map(inv => {
      const totalQuantity = inv.warehousesales.reduce((sum, wi) => sum + wi.quantity, 0);
      const totalPurchaseValue = totalQuantity * parseFloat(inv.purchasePrice);
      const totalSellingValue = totalQuantity * parseFloat(inv.sellingPrice);
      const potentialProfit = totalSellingValue - totalPurchaseValue;
      
      return {
        ...inv,
        totalQuantity,
        totalPurchaseValue: totalPurchaseValue.toFixed(2),
        totalSellingValue: totalSellingValue.toFixed(2),
        potentialProfit: potentialProfit.toFixed(2),
        profitMargin: totalPurchaseValue > 0 ? ((potentialProfit / totalPurchaseValue) * 100).toFixed(2) : '0.00'
      };
    });

    res.status(200).json(salesWithTotal);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single sales
export const getsalesById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const sales = await prisma.sales.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } },
        warehousesales: {
          include: {
            warehouse: { select: { id: true, name: true, location: true } }
          }
        },
        logs: {
          include: {
            user: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
    });

    if (!sales) {
      return res.status(404).json({ message: 'sales not found' });
    }

    const totalQuantity = sales.warehousesales.reduce((sum, wi) => sum + wi.quantity, 0);
    const totalPurchaseValue = totalQuantity * parseFloat(sales.purchasePrice);
    const totalSellingValue = totalQuantity * parseFloat(sales.sellingPrice);
    const potentialProfit = totalSellingValue - totalPurchaseValue;

    res.status(200).json({ 
      ...sales, 
      totalQuantity,
      totalPurchaseValue: totalPurchaseValue.toFixed(2),
      totalSellingValue: totalSellingValue.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      profitMargin: totalPurchaseValue > 0 ? ((potentialProfit / totalPurchaseValue) * 100).toFixed(2) : '0.00'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add sales (Admin only)
export const addsales = async (req, res) => {
  try {
    const { name, sku, description, categoryId, unit, minStock, purchasePrice, sellingPrice, currency } = req.body;
    const userId = req.user.id;

    const existing = await prisma.sales.findUnique({ where: { sku } });
    if (existing) {
      return res.status(400).json({ message: 'SKU already exists' });
    }

    // Validate pricing
    const purchase = parseFloat(purchasePrice) || 0;
    const selling = parseFloat(sellingPrice) || 0;

    if (purchase < 0 || selling < 0) {
      return res.status(400).json({ message: 'Prices cannot be negative' });
    }

    if (selling < purchase) {
      return res.status(400).json({ message: 'Warning: Selling price is lower than purchase price' });
    }

    const sales = await prisma.sales.create({
      data: {
        name,
        sku,
        description,
        categoryId: parseInt(categoryId),
        unit,
        minStock: parseInt(minStock) || 0,
        purchasePrice: purchase,
        sellingPrice: selling,
        currency: currency || 'INR',
        createdById: userId,
      },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } }
      }
    });

    res.status(201).json({ message: 'sales created', sales });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update sales (Admin only)
export const updatesales = async (req, res) => {
  const { id } = req.params;
  const { name, sku, description, categoryId, unit, minStock, purchasePrice, sellingPrice, currency } = req.body;

  try {
    // Validate pricing if provided
    if (purchasePrice !== undefined || sellingPrice !== undefined) {
      const purchase = parseFloat(purchasePrice) || 0;
      const selling = parseFloat(sellingPrice) || 0;

      if (purchase < 0 || selling < 0) {
        return res.status(400).json({ message: 'Prices cannot be negative' });
      }
    }

    const updateData = {
      name,
      sku,
      description,
      unit,
    };

    if (categoryId) updateData.categoryId = parseInt(categoryId);
    if (minStock !== undefined) updateData.minStock = parseInt(minStock);
    if (purchasePrice !== undefined) updateData.purchasePrice = parseFloat(purchasePrice);
    if (sellingPrice !== undefined) updateData.sellingPrice = parseFloat(sellingPrice);
    if (currency) updateData.currency = currency;

    const sales = await prisma.sales.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } }
      }
    });

    res.json({ message: 'sales updated', sales });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'SKU already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'sales not found' });
    }
    res.status(500).json({ message: 'Error updating sales', error: err.message });
  }
};

// Toggle sales status (Admin only)
export const togglesalesStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const sales = await prisma.sales.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json({ message: `sales ${status ? 'activated' : 'deactivated'}`, sales });
  } catch (err) {
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// Delete sales (Admin only)
export const deletesales = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if sales has stock in any warehouse
    const sales = await prisma.sales.findUnique({
      where: { id: parseInt(id) },
      include: { warehousesales: true }
    });

    const totalStock = sales?.warehousesales.reduce((sum, wi) => sum + wi.quantity, 0) || 0;

    if (totalStock > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete sales with existing stock. Please remove all stock first.' 
      });
    }

    await prisma.sales.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'sales deleted' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'sales not found' });
    }
    res.status(500).json({ message: 'Error deleting sales', error: err.message });
  }
};

// Assign sales to warehouse with quantity (Admin only)
export const assignsalesToWarehouse = async (req, res) => {
  const { salesId, warehouseId, quantity } = req.body;
  const userId = req.user.id;

  try {
    const qty = parseInt(quantity);
    
    if (qty < 0) {
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }

    // Check if sales exists
    const sales = await prisma.sales.findUnique({
      where: { id: parseInt(salesId) }
    });

    if (!sales) {
      return res.status(404).json({ message: 'sales not found' });
    }

    // Check if warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(warehouseId) }
    });

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Check if assignment already exists
      const existing = await tx.warehousesales.findUnique({
        where: {
          warehouseId_salesId: {
            warehouseId: parseInt(warehouseId),
            salesId: parseInt(salesId)
          }
        }
      });

      let warehousesales;
      const previousQty = existing?.quantity || 0;
      const newQty = previousQty + qty;

      if (existing) {
        // Update existing assignment
        warehousesales = await tx.warehousesales.update({
          where: {
            warehouseId_salesId: {
              warehouseId: parseInt(warehouseId),
              salesId: parseInt(salesId)
            }
          },
          data: { quantity: newQty },
          include: {
            warehouse: { select: { id: true, name: true } },
            sales: { select: { id: true, name: true, sku: true } }
          }
        });
      } else {
        // Create new assignment
        warehousesales = await tx.warehousesales.create({
          data: {
            warehouseId: parseInt(warehouseId),
            salesId: parseInt(salesId),
            quantity: qty
          },
          include: {
            warehouse: { select: { id: true, name: true } },
            sales: { select: { id: true, name: true, sku: true } }
          }
        });
      }

      // Create log entry
      await tx.salesLog.create({
        data: {
          salesId: parseInt(salesId),
          warehouseId: parseInt(warehouseId),
          action: 'ADD',
          quantity: qty,
          previousQty,
          newQty,
          remarks: `Added ${qty} ${sales.unit} to ${warehouse.name}`,
          userId
        }
      });

      return warehousesales;
    });

    res.status(200).json({ 
      message: 'sales assigned to warehouse successfully', 
      warehousesales: result 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error assigning sales', error: err.message });
  }
};

// Adjust sales quantity in warehouse (Admin only)
export const adjustsalesQuantity = async (req, res) => {
  const { warehouseId, salesId, quantity, remarks } = req.body;
  const userId = req.user.id;

  try {
    const qty = parseInt(quantity);

    const existing = await prisma.warehousesales.findUnique({
      where: {
        warehouseId_salesId: {
          warehouseId: parseInt(warehouseId),
          salesId: parseInt(salesId)
        }
      },
      include: {
        sales: true,
        warehouse: true
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'sales not found in this warehouse' });
    }

    const newQty = existing.quantity + qty;

    if (newQty < 0) {
      return res.status(400).json({ message: 'Insufficient stock. Cannot reduce below zero.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.warehousesales.update({
        where: {
          warehouseId_salesId: {
            warehouseId: parseInt(warehouseId),
            salesId: parseInt(salesId)
          }
        },
        data: { quantity: newQty },
        include: {
          warehouse: { select: { id: true, name: true } },
          sales: { select: { id: true, name: true, sku: true } }
        }
      });

      await tx.salesLog.create({
        data: {
          salesId: parseInt(salesId),
          warehouseId: parseInt(warehouseId),
          action: 'ADJUSTMENT',
          quantity: Math.abs(qty),
          previousQty: existing.quantity,
          newQty,
          remarks: remarks || `Adjusted by ${qty > 0 ? '+' : ''}${qty} ${existing.sales.unit}`,
          userId
        }
      });

      return updated;
    });

    res.json({ message: 'sales quantity adjusted', warehousesales: result });
  } catch (err) {
    res.status(500).json({ message: 'Error adjusting sales', error: err.message });
  }
};

// Get sales by warehouse
export const getsalesByWarehouse = async (req, res) => {
  const { warehouseId } = req.params;

  try {
    const warehousesales = await prisma.warehousesales.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      include: {
        sales: {
          include: {
            category: true
          }
        },
        warehouse: { select: { id: true, name: true, location: true } }
      }
    });

    // Add value calculations
    const salesWithValue = warehousesales.map(wi => {
      const purchaseValue = wi.quantity * parseFloat(wi.sales.purchasePrice);
      const sellingValue = wi.quantity * parseFloat(wi.sales.sellingPrice);
      
      return {
        ...wi,
        purchaseValue: purchaseValue.toFixed(2),
        sellingValue: sellingValue.toFixed(2),
        potentialProfit: (sellingValue - purchaseValue).toFixed(2)
      };
    });

    res.status(200).json(salesWithValue);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const sales = await prisma.sales.findMany({
      where: { status: true },
      include: {
        category: true,
        warehousesales: {
          include: {
            warehouse: { select: { id: true, name: true, location: true } }
          }
        }
      }
    });

    const lowStockItems = [];

    sales.forEach(inv => {
      const totalQty = inv.warehousesales.reduce((sum, wi) => sum + wi.quantity, 0);
      
      if (totalQty <= inv.minStock) {
        const purchaseValue = totalQty * parseFloat(inv.purchasePrice);
        const sellingValue = totalQty * parseFloat(inv.sellingPrice);
        
        lowStockItems.push({
          ...inv,
          totalQuantity: totalQty,
          deficit: inv.minStock - totalQty,
          totalPurchaseValue: purchaseValue.toFixed(2),
          totalSellingValue: sellingValue.toFixed(2)
        });
      }
    });

    res.status(200).json(lowStockItems);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get sales value summary (Admin only)
export const getsalesValueSummary = async (req, res) => {
  try {
    const sales = await prisma.sales.findMany({
      where: { status: true },
      include: {
        warehousesales: true
      }
    });

    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let totalItems = 0;

    sales.forEach(inv => {
      const qty = inv.warehousesales.reduce((sum, wi) => sum + wi.quantity, 0);
      totalItems += qty;
      totalPurchaseValue += qty * parseFloat(inv.purchasePrice);
      totalSellingValue += qty * parseFloat(inv.sellingPrice);
    });

    const potentialProfit = totalSellingValue - totalPurchaseValue;
    const profitMargin = totalPurchaseValue > 0 ? (potentialProfit / totalPurchaseValue) * 100 : 0;

    res.status(200).json({
      totalItems,
      totalPurchaseValue: totalPurchaseValue.toFixed(2),
      totalSellingValue: totalSellingValue.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
      currency: 'INR'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get warehouse value summary (Admin/Manager)
export const getWarehouseValueSummary = async (req, res) => {
  const { warehouseId } = req.params;

  try {
    const warehousesales = await prisma.warehousesales.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      include: {
        sales: true
      }
    });

    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let totalItems = 0;

    warehousesales.forEach(wi => {
      totalItems += wi.quantity;
      totalPurchaseValue += wi.quantity * parseFloat(wi.sales.purchasePrice);
      totalSellingValue += wi.quantity * parseFloat(wi.sales.sellingPrice);
    });

    const potentialProfit = totalSellingValue - totalPurchaseValue;
    const profitMargin = totalPurchaseValue > 0 ? (potentialProfit / totalPurchaseValue) * 100 : 0;

    res.status(200).json({
      warehouseId: parseInt(warehouseId),
      totalItems,
      totalPurchaseValue: totalPurchaseValue.toFixed(2),
      totalSellingValue: totalSellingValue.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
      currency: 'INR'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};