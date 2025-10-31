import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all warehouses
export const getAllWarehouses = async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, status: true }
        },
        _count: {
          select: { users: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Manually fetch manager details for each warehouse
    const warehousesWithManager = await Promise.all(
      warehouses.map(async (warehouse) => {
        if (warehouse.managerId) {
          const manager = await prisma.user.findUnique({
            where: { id: warehouse.managerId },
            select: { id: true, name: true, email: true, role: true, status: true }
          });
          return { ...warehouse, manager };
        }
        return { ...warehouse, manager: null };
      })
    );

    res.status(200).json(warehousesWithManager);
  } catch (err) {
    console.error('Get all warehouses error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get single warehouse
export const getWarehouseById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, status: true }
        },
        _count: {
          select: { users: true }
        }
      }
    });

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Fetch manager details if managerId exists
    let manager = null;
    if (warehouse.managerId) {
      manager = await prisma.user.findUnique({
        where: { id: warehouse.managerId },
        select: { id: true, name: true, email: true, role: true, status: true }
      });
    }

    res.status(200).json({ ...warehouse, manager });
  } catch (err) {
    console.error('Get warehouse by ID error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add warehouse
export const addWarehouse = async (req, res) => {
  try {
    const { name, location, managerId } = req.body;

    // Validation
    if (!name || !location) {
      return res.status(400).json({ message: 'Name and location are required' });
    }

    if (!managerId) {
      return res.status(400).json({ message: 'Manager is required' });
    }

    // Check if warehouse name already exists
    const existing = await prisma.warehouse.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: 'Warehouse name already exists' });
    }

    // Validate manager exists and has correct role
    const manager = await prisma.user.findUnique({
      where: { id: parseInt(managerId) }
    });

    if (!manager) {
      return res.status(400).json({ message: 'Manager not found' });
    }

    if (manager.role !== 'ADMIN' && manager.role !== 'MANAGER') {
      return res.status(400).json({ message: 'Manager must be an ADMIN or MANAGER' });
    }

    if (!manager.status) {
      return res.status(400).json({ message: 'Manager is not active' });
    }

    // Create warehouse with managerId
    const warehouse = await prisma.warehouse.create({
      data: { 
        name, 
        location,
        managerId: parseInt(managerId)
      },
      include: {
        users: true,
        _count: {
          select: { users: true }
        }
      }
    });

    // Automatically assign the manager to the warehouse
    await prisma.user.update({
      where: { id: parseInt(managerId) },
      data: { warehouseId: warehouse.id }
    });

    // Fetch manager details for response
    const managerDetails = await prisma.user.findUnique({
      where: { id: parseInt(managerId) },
      select: { id: true, name: true, email: true, role: true }
    });

    res.status(201).json({ 
      message: 'Warehouse created successfully', 
      warehouse: { ...warehouse, manager: managerDetails }
    });
  } catch (err) {
    console.error('Add warehouse error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update warehouse
export const updateWarehouse = async (req, res) => {
  const { id } = req.params;
  const { name, location, managerId } = req.body;

  try {
    // Check if warehouse exists
    const existingWarehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingWarehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Validate manager if provided
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: parseInt(managerId) }
      });

      if (!manager) {
        return res.status(400).json({ message: 'Manager not found' });
      }

      if (manager.role !== 'ADMIN' && manager.role !== 'MANAGER') {
        return res.status(400).json({ message: 'Manager must be an ADMIN or MANAGER' });
      }

      if (!manager.status) {
        return res.status(400).json({ message: 'Manager is not active' });
      }
    }

    // If manager is changing, remove old manager from warehouse
    if (existingWarehouse.managerId && managerId && existingWarehouse.managerId !== parseInt(managerId)) {
      await prisma.user.update({
        where: { id: existingWarehouse.managerId },
        data: { warehouseId: null }
      });
    }

    // Update warehouse
    const warehouse = await prisma.warehouse.update({
      where: { id: parseInt(id) },
      data: { 
        name, 
        location,
        managerId: managerId ? parseInt(managerId) : undefined
      },
      include: {
        users: true,
        _count: {
          select: { users: true }
        }
      }
    });

    // Assign new manager to warehouse
    if (managerId) {
      await prisma.user.update({
        where: { id: parseInt(managerId) },
        data: { warehouseId: warehouse.id }
      });
    }

    // Fetch manager details for response
    let managerDetails = null;
    if (managerId) {
      managerDetails = await prisma.user.findUnique({
        where: { id: parseInt(managerId) },
        select: { id: true, name: true, email: true, role: true }
      });
    }

    res.json({ 
      message: 'Warehouse updated successfully', 
      warehouse: { ...warehouse, manager: managerDetails }
    });
  } catch (err) {
    console.error('Update warehouse error:', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Warehouse name already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    res.status(500).json({ message: 'Error updating warehouse', error: err.message });
  }
};

// Toggle warehouse status
export const toggleWarehouseStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const existingWarehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingWarehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id: parseInt(id) },
      data: { status },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    // Fetch manager details if exists
    let manager = null;
    if (warehouse.managerId) {
      manager = await prisma.user.findUnique({
        where: { id: warehouse.managerId },
        select: { id: true, name: true, email: true, role: true }
      });
    }

    res.json({ 
      message: `Warehouse ${status ? 'activated' : 'deactivated'} successfully`, 
      warehouse: { ...warehouse, manager }
    });
  } catch (err) {
    console.error('Toggle warehouse status error:', err);
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// Delete warehouse
export const deleteWarehouse = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if warehouse exists and has users
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) },
      include: { 
        _count: { select: { users: true } }
      }
    });

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    if (warehouse._count.users > 0) {
      return res.status(400).json({ 
        message: `Cannot delete warehouse with ${warehouse._count.users} assigned user(s). Please reassign them first.` 
      });
    }

    // Remove manager assignment before deleting
    if (warehouse.managerId) {
      await prisma.user.update({
        where: { id: warehouse.managerId },
        data: { warehouseId: null }
      });
    }

    await prisma.warehouse.delete({ where: { id: parseInt(id) } });
    
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (err) {
    console.error('Delete warehouse error:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    res.status(500).json({ message: 'Error deleting warehouse', error: err.message });
  }
};

// Assign users to warehouse
export const assignUsersToWarehouse = async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;

  try {
    // Check if warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) }
    });

    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Validate all users exist
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });

    if (users.length !== userIds.length) {
      return res.status(400).json({ message: 'Some users not found' });
    }

    // Get current users assigned to this warehouse
    const currentUsers = await prisma.user.findMany({
      where: { warehouseId: parseInt(id) },
      select: { id: true }
    });

    const currentUserIds = currentUsers.map(u => u.id);

    // Users to unassign (in current but not in new list, excluding manager)
    const usersToUnassign = currentUserIds.filter(
      userId => !userIds.includes(userId) && userId !== warehouse.managerId
    );

    // Users to assign (in new list but not in current)
    const usersToAssign = userIds.filter(userId => !currentUserIds.includes(userId));

    // Unassign users
    if (usersToUnassign.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: usersToUnassign } },
        data: { warehouseId: null }
      });
    }

    // Assign new users
    if (usersToAssign.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: usersToAssign } },
        data: { warehouseId: parseInt(id) }
      });
    }

    // Fetch updated warehouse
    const updatedWarehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(id) },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true }
        },
        _count: {
          select: { users: true }
        }
      }
    });

    // Fetch manager details
    let manager = null;
    if (updatedWarehouse.managerId) {
      manager = await prisma.user.findUnique({
        where: { id: updatedWarehouse.managerId },
        select: { id: true, name: true, email: true, role: true }
      });
    }

    res.json({ 
      message: 'Users assigned to warehouse successfully', 
      warehouse: { ...updatedWarehouse, manager }
    });
  } catch (err) {
    console.error('Assign users error:', err);
    res.status(500).json({ message: 'Error assigning users', error: err.message });
  }
};

// Remove user from warehouse
export const removeUserFromWarehouse = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { warehouse: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent removing manager from their managed warehouse
    if (user.warehouse && user.warehouse.managerId === user.id) {
      return res.status(400).json({ 
        message: 'Cannot remove manager from their managed warehouse. Please change the warehouse manager first.' 
      });
    }

    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { warehouseId: null }
    });

    res.json({ message: 'User removed from warehouse successfully' });
  } catch (err) {
    console.error('Remove user error:', err);
    res.status(500).json({ message: 'Error removing user', error: err.message });
  }
};