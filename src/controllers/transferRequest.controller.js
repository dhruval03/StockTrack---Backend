import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Generate unique request number
const generateRequestNumber = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TR-${timestamp}-${random}`;
};

// Get all transfer requests (Admin sees all, Manager sees their warehouse requests)
export const getAllTransferRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let whereClause = {};

    if (userRole === 'MANAGER') {
      // Manager can only see requests related to their warehouse
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { warehouseId: true }
      });

      if (!user.warehouseId) {
        return res.status(400).json({ message: 'Manager not assigned to any warehouse' });
      }

      whereClause = {
        OR: [
          { fromWarehouseId: user.warehouseId },
          { toWarehouseId: user.warehouseId }
        ]
      };
    }

    const requests = await prisma.transferRequest.findMany({
      where: whereClause,
      include: {
        fromWarehouse: { select: { id: true, name: true, location: true } },
        toWarehouse: { select: { id: true, name: true, location: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            inventory: {
              select: { id: true, name: true, sku: true, unit: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single transfer request
export const getTransferRequestById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const request = await prisma.transferRequest.findUnique({
      where: { id: parseInt(id) },
      include: {
        fromWarehouse: { select: { id: true, name: true, location: true } },
        toWarehouse: { select: { id: true, name: true, location: true } },
        createdBy: { select: { id: true, name: true, role: true, email: true } },
        approvedBy: { select: { id: true, name: true, role: true, email: true } },
        items: {
          include: {
            inventory: {
              select: { id: true, name: true, sku: true, unit: true, category: true }
            }
          }
        }
      }
    });

    if (!request) {
      return res.status(404).json({ message: 'Transfer request not found' });
    }

    res.status(200).json(request);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Create transfer request (Manager only)
export const createTransferRequest = async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, reason, items } = req.body;
    const userId = req.user.id;

    // Validate warehouses
    if (parseInt(fromWarehouseId) === parseInt(toWarehouseId)) {
      return res.status(400).json({ message: 'Source and destination warehouses cannot be the same' });
    }

    // Check if manager is assigned to the source warehouse
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true }
    });

    if (user.warehouseId !== parseInt(fromWarehouseId)) {
      return res.status(403).json({ message: 'You can only create transfer requests from your assigned warehouse' });
    }

    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Transfer request must include at least one item' });
    }

    // Check stock availability
    for (const item of items) {
      const warehouseInventory = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_inventoryId: {
            warehouseId: parseInt(fromWarehouseId),
            inventoryId: parseInt(item.inventoryId)
          }
        }
      });

      if (!warehouseInventory || warehouseInventory.quantity < parseInt(item.quantity)) {
        const inventory = await prisma.inventory.findUnique({
          where: { id: parseInt(item.inventoryId) }
        });
        return res.status(400).json({ 
          message: `Insufficient stock for ${inventory?.name || 'item'}. Available: ${warehouseInventory?.quantity || 0}, Requested: ${item.quantity}` 
        });
      }
    }

    const requestNumber = generateRequestNumber();

    const transferRequest = await prisma.transferRequest.create({
      data: {
        requestNumber,
        fromWarehouseId: parseInt(fromWarehouseId),
        toWarehouseId: parseInt(toWarehouseId),
        reason,
        createdById: userId,
        items: {
          create: items.map(item => ({
            inventoryId: parseInt(item.inventoryId),
            quantity: parseInt(item.quantity)
          }))
        }
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        items: {
          include: {
            inventory: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    });

    res.status(201).json({ message: 'Transfer request created', transferRequest });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Approve transfer request (Admin only)
export const approveTransferRequest = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const request = await prisma.transferRequest.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            inventory: true
          }
        },
        fromWarehouse: true,
        toWarehouse: true
      }
    });

    if (!request) {
      return res.status(404).json({ message: 'Transfer request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot approve request with status: ${request.status}` });
    }

    // Verify stock availability again
    for (const item of request.items) {
      const warehouseInventory = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_inventoryId: {
            warehouseId: request.fromWarehouseId,
            inventoryId: item.inventoryId
          }
        }
      });

      if (!warehouseInventory || warehouseInventory.quantity < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${item.inventory.name}. Available: ${warehouseInventory?.quantity || 0}` 
        });
        }
    }

    // Execute transfer in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update transfer request status
      const updatedRequest = await tx.transferRequest.update({
        where: { id: parseInt(id) },
        data: {
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date()
        },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          items: {
            include: {
              inventory: { select: { id: true, name: true, sku: true, unit: true } }
            }
          }
        }
      });

      // Process each item
      for (const item of request.items) {
        // Reduce quantity from source warehouse
        const fromInventory = await tx.warehouseInventory.findUnique({
          where: {
            warehouseId_inventoryId: {
              warehouseId: request.fromWarehouseId,
              inventoryId: item.inventoryId
            }
          }
        });

        const newFromQty = fromInventory.quantity - item.quantity;

        await tx.warehouseInventory.update({
          where: {
            warehouseId_inventoryId: {
              warehouseId: request.fromWarehouseId,
              inventoryId: item.inventoryId
            }
          },
          data: { quantity: newFromQty }
        });

        // Log transfer out
        await tx.inventoryLog.create({
          data: {
            inventoryId: item.inventoryId,
            warehouseId: request.fromWarehouseId,
            action: 'TRANSFER_OUT',
            quantity: item.quantity,
            previousQty: fromInventory.quantity,
            newQty: newFromQty,
            remarks: `Transfer to ${request.toWarehouse.name} - Request #${request.requestNumber}`,
            userId
          }
        });

        // Add quantity to destination warehouse
        const toInventory = await tx.warehouseInventory.findUnique({
          where: {
            warehouseId_inventoryId: {
              warehouseId: request.toWarehouseId,
              inventoryId: item.inventoryId
            }
          }
        });

        let newToQty;
        if (toInventory) {
          newToQty = toInventory.quantity + item.quantity;
          await tx.warehouseInventory.update({
            where: {
              warehouseId_inventoryId: {
                warehouseId: request.toWarehouseId,
                inventoryId: item.inventoryId
              }
            },
            data: { quantity: newToQty }
          });
        } else {
          newToQty = item.quantity;
          await tx.warehouseInventory.create({
            data: {
              warehouseId: request.toWarehouseId,
              inventoryId: item.inventoryId,
              quantity: newToQty
            }
          });
        }

        // Log transfer in
        await tx.inventoryLog.create({
          data: {
            inventoryId: item.inventoryId,
            warehouseId: request.toWarehouseId,
            action: 'TRANSFER_IN',
            quantity: item.quantity,
            previousQty: toInventory?.quantity || 0,
            newQty: newToQty,
            remarks: `Transfer from ${request.fromWarehouse.name} - Request #${request.requestNumber}`,
            userId
          }
        });
      }

      // Mark as completed
      const completedRequest = await tx.transferRequest.update({
        where: { id: parseInt(id) },
        data: { status: 'COMPLETED' },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          items: {
            include: {
              inventory: { select: { id: true, name: true, sku: true, unit: true } }
            }
          }
        }
      });

      return completedRequest;
    });

    res.json({ message: 'Transfer request approved and completed successfully', transferRequest: result });
  } catch (err) {
    res.status(500).json({ message: 'Error approving transfer request', error: err.message });
  }
};

// Reject transfer request (Admin only)
export const rejectTransferRequest = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  try {
    const request = await prisma.transferRequest.findUnique({
      where: { id: parseInt(id) }
    });

    if (!request) {
      return res.status(404).json({ message: 'Transfer request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot reject request with status: ${request.status}` });
    }

    const updatedRequest = await prisma.transferRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: 'REJECTED',
        approvedById: userId,
        approvedAt: new Date(),
        reason: reason || request.reason
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            inventory: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    });

    res.json({ message: 'Transfer request rejected', transferRequest: updatedRequest });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting transfer request', error: err.message });
  }
};

// Cancel transfer request (Manager can cancel their own pending requests)
export const cancelTransferRequest = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const request = await prisma.transferRequest.findUnique({
      where: { id: parseInt(id) }
    });

    if (!request) {
      return res.status(404).json({ message: 'Transfer request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot cancel request with status: ${request.status}` });
    }

    // Manager can only cancel their own requests
    if (userRole === 'MANAGER' && request.createdById !== userId) {
      return res.status(403).json({ message: 'You can only cancel your own transfer requests' });
    }

    const updatedRequest = await prisma.transferRequest.update({
      where: { id: parseInt(id) },
      data: { status: 'CANCELLED' },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            inventory: { select: { id: true, name: true, sku: true } }
          }
        }
      }
    });

    res.json({ message: 'Transfer request cancelled', transferRequest: updatedRequest });
  } catch (err) {
    res.status(500).json({ message: 'Error cancelling transfer request', error: err.message });
  }
};

// Get transfer requests by warehouse (Manager sees their warehouse)
export const getTransferRequestsByWarehouse = async (req, res) => {
  const { warehouseId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // If manager, verify they're assigned to this warehouse
    if (userRole === 'MANAGER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { warehouseId: true }
      });

      if (user.warehouseId !== parseInt(warehouseId)) {
        return res.status(403).json({ message: 'Access denied to this warehouse' });
      }
    }

    const requests = await prisma.transferRequest.findMany({
      where: {
        OR: [
          { fromWarehouseId: parseInt(warehouseId) },
          { toWarehouseId: parseInt(warehouseId) }
        ]
      },
      include: {
        fromWarehouse: { select: { id: true, name: true, location: true } },
        toWarehouse: { select: { id: true, name: true, location: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            inventory: { select: { id: true, name: true, sku: true, unit: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get transfer request statistics
export const getTransferRequestStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let whereClause = {};

    if (userRole === 'MANAGER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { warehouseId: true }
      });

      if (!user.warehouseId) {
        return res.status(400).json({ message: 'Manager not assigned to any warehouse' });
      }

      whereClause = {
        OR: [
          { fromWarehouseId: user.warehouseId },
          { toWarehouseId: user.warehouseId }
        ]
      };
    }

    const [total, pending, approved, rejected, completed, cancelled] = await Promise.all([
      prisma.transferRequest.count({ where: whereClause }),
      prisma.transferRequest.count({ where: { ...whereClause, status: 'PENDING' } }),
      prisma.transferRequest.count({ where: { ...whereClause, status: 'APPROVED' } }),
      prisma.transferRequest.count({ where: { ...whereClause, status: 'REJECTED' } }),
      prisma.transferRequest.count({ where: { ...whereClause, status: 'COMPLETED' } }),
      prisma.transferRequest.count({ where: { ...whereClause, status: 'CANCELLED' } })
    ]);

    res.status(200).json({
      total,
      pending,
      approved,
      rejected,
      completed,
      cancelled
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};