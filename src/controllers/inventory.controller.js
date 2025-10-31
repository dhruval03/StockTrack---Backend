import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all inventories (All authenticated users)
export const getAllInventories = async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        warehouseInventories: {
          include: {
            warehouse: { select: { id: true, name: true, location: true } }
          }
        },
        _count: {
          select: { warehouseInventories: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate total quantity and total value across all warehouses
    const inventoriesWithTotal = inventories.map(inv => {
      const totalQuantity = inv.warehouseInventories.reduce((sum, wi) => sum + wi.quantity, 0);
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

    res.status(200).json(inventoriesWithTotal);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single inventory
export const getInventoryById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const inventory = await prisma.inventory.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } },
        warehouseInventories: {
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

    if (!inventory) {
      return res.status(404).json({ message: 'Inventory not found' });
    }

    const totalQuantity = inventory.warehouseInventories.reduce((sum, wi) => sum + wi.quantity, 0);
    const totalPurchaseValue = totalQuantity * parseFloat(inventory.purchasePrice);
    const totalSellingValue = totalQuantity * parseFloat(inventory.sellingPrice);
    const potentialProfit = totalSellingValue - totalPurchaseValue;

    res.status(200).json({ 
      ...inventory, 
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

// Add inventory (Admin only)
export const addInventory = async (req, res) => {
  try {
    const { name, sku, description, categoryId, unit, minStock, purchasePrice, sellingPrice, currency } = req.body;
    const userId = req.user.id;

    const existing = await prisma.inventory.findUnique({ where: { sku } });
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

    const inventory = await prisma.inventory.create({
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

    res.status(201).json({ message: 'Inventory created', inventory });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update inventory (Admin only)
export const updateInventory = async (req, res) => {
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

    const inventory = await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } }
      }
    });

    res.json({ message: 'Inventory updated', inventory });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'SKU already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    res.status(500).json({ message: 'Error updating inventory', error: err.message });
  }
};

// Toggle inventory status (Admin only)
export const toggleInventoryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const inventory = await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json({ message: `Inventory ${status ? 'activated' : 'deactivated'}`, inventory });
  } catch (err) {
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// Delete inventory (Admin only)
export const deleteInventory = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if inventory has stock in any warehouse
    const inventory = await prisma.inventory.findUnique({
      where: { id: parseInt(id) },
      include: { warehouseInventories: true }
    });

    const totalStock = inventory?.warehouseInventories.reduce((sum, wi) => sum + wi.quantity, 0) || 0;

    if (totalStock > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete inventory with existing stock. Please remove all stock first.' 
      });
    }

    await prisma.inventory.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Inventory deleted' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Inventory not found' });
    }
    res.status(500).json({ message: 'Error deleting inventory', error: err.message });
  }
};

// Assign inventory to warehouse with quantity (Admin only)
export const assignInventoryToWarehouse = async (req, res) => {
  const { inventoryId, warehouseId, quantity } = req.body;
  const userId = req.user.id;

  try {
    const qty = parseInt(quantity);
    
    if (qty < 0) {
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }

    // Check if inventory exists
    const inventory = await prisma.inventory.findUnique({
      where: { id: parseInt(inventoryId) }
    });

    if (!inventory) {
      return res.status(404).json({ message: 'Inventory not found' });
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
      const existing = await tx.warehouseInventory.findUnique({
        where: {
          warehouseId_inventoryId: {
            warehouseId: parseInt(warehouseId),
            inventoryId: parseInt(inventoryId)
          }
        }
      });

      let warehouseInventory;
      const previousQty = existing?.quantity || 0;
      const newQty = previousQty + qty;

      if (existing) {
        // Update existing assignment
        warehouseInventory = await tx.warehouseInventory.update({
          where: {
            warehouseId_inventoryId: {
              warehouseId: parseInt(warehouseId),
              inventoryId: parseInt(inventoryId)
            }
          },
          data: { quantity: newQty },
          include: {
            warehouse: { select: { id: true, name: true } },
            inventory: { select: { id: true, name: true, sku: true } }
          }
        });
      } else {
        // Create new assignment
        warehouseInventory = await tx.warehouseInventory.create({
          data: {
            warehouseId: parseInt(warehouseId),
            inventoryId: parseInt(inventoryId),
            quantity: qty
          },
          include: {
            warehouse: { select: { id: true, name: true } },
            inventory: { select: { id: true, name: true, sku: true } }
          }
        });
      }

      // Create log entry
      await tx.inventoryLog.create({
        data: {
          inventoryId: parseInt(inventoryId),
          warehouseId: parseInt(warehouseId),
          action: 'ADD',
          quantity: qty,
          previousQty,
          newQty,
          remarks: `Added ${qty} ${inventory.unit} to ${warehouse.name}`,
          userId
        }
      });

      return warehouseInventory;
    });

    res.status(200).json({ 
      message: 'Inventory assigned to warehouse successfully', 
      warehouseInventory: result 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error assigning inventory', error: err.message });
  }
};

// Adjust inventory quantity in warehouse (Admin only)
export const adjustInventoryQuantity = async (req, res) => {
  const { warehouseId, inventoryId, quantity, remarks } = req.body;
  const userId = req.user.id;

  try {
    const qty = parseInt(quantity);

    const existing = await prisma.warehouseInventory.findUnique({
      where: {
        warehouseId_inventoryId: {
          warehouseId: parseInt(warehouseId),
          inventoryId: parseInt(inventoryId)
        }
      },
      include: {
        inventory: true,
        warehouse: true
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Inventory not found in this warehouse' });
    }

    const newQty = existing.quantity + qty;

    if (newQty < 0) {
      return res.status(400).json({ message: 'Insufficient stock. Cannot reduce below zero.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.warehouseInventory.update({
        where: {
          warehouseId_inventoryId: {
            warehouseId: parseInt(warehouseId),
            inventoryId: parseInt(inventoryId)
          }
        },
        data: { quantity: newQty },
        include: {
          warehouse: { select: { id: true, name: true } },
          inventory: { select: { id: true, name: true, sku: true } }
        }
      });

      await tx.inventoryLog.create({
        data: {
          inventoryId: parseInt(inventoryId),
          warehouseId: parseInt(warehouseId),
          action: 'ADJUSTMENT',
          quantity: Math.abs(qty),
          previousQty: existing.quantity,
          newQty,
          remarks: remarks || `Adjusted by ${qty > 0 ? '+' : ''}${qty} ${existing.inventory.unit}`,
          userId
        }
      });

      return updated;
    });

    res.json({ message: 'Inventory quantity adjusted', warehouseInventory: result });
  } catch (err) {
    res.status(500).json({ message: 'Error adjusting inventory', error: err.message });
  }
};

// Get inventory by warehouse
export const getInventoryByWarehouse = async (req, res) => {
  const { warehouseId } = req.params;

  try {
    const warehouseInventories = await prisma.warehouseInventory.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      include: {
        inventory: {
          include: {
            category: true
          }
        },
        warehouse: { select: { id: true, name: true, location: true } }
      }
    });

    // Add value calculations
    const inventoriesWithValue = warehouseInventories.map(wi => {
      const purchaseValue = wi.quantity * parseFloat(wi.inventory.purchasePrice);
      const sellingValue = wi.quantity * parseFloat(wi.inventory.sellingPrice);
      
      return {
        ...wi,
        purchaseValue: purchaseValue.toFixed(2),
        sellingValue: sellingValue.toFixed(2),
        potentialProfit: (sellingValue - purchaseValue).toFixed(2)
      };
    });

    res.status(200).json(inventoriesWithValue);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { status: true },
      include: {
        category: true,
        warehouseInventories: {
          include: {
            warehouse: { select: { id: true, name: true, location: true } }
          }
        }
      }
    });

    const lowStockItems = [];

    inventories.forEach(inv => {
      const totalQty = inv.warehouseInventories.reduce((sum, wi) => sum + wi.quantity, 0);
      
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

// Get inventory value summary (Admin only)
export const getInventoryValueSummary = async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { status: true },
      include: {
        warehouseInventories: true
      }
    });

    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let totalItems = 0;

    inventories.forEach(inv => {
      const qty = inv.warehouseInventories.reduce((sum, wi) => sum + wi.quantity, 0);
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
    const warehouseInventories = await prisma.warehouseInventory.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      include: {
        inventory: true
      }
    });

    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let totalItems = 0;

    warehouseInventories.forEach(wi => {
      totalItems += wi.quantity;
      totalPurchaseValue += wi.quantity * parseFloat(wi.inventory.purchasePrice);
      totalSellingValue += wi.quantity * parseFloat(wi.inventory.sellingPrice);
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