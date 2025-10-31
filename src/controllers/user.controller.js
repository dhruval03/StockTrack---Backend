import bcrypt from 'bcrypt';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all users (Admin only)
// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        status: true, 
        manager: { select: { id: true, name: true } },
        warehouse: { 
          select: { 
            id: true, 
            name: true, 
            location: true,
            manager: { 
              select: { 
                id: true, 
                name: true 
              } 
            }
          } 
        },
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(users);
  } catch (err) {
    console.error('Get all users error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add user
export const addUser = async (req, res) => {
  try {
    const { name, email, password, role, managerId, warehouseId } = req.body;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Role-specific validation
    if (role === 'STAFF' && !managerId) {
      return res.status(400).json({ message: 'STAFF role requires a manager' });
    }
    
    if (role !== 'STAFF' && managerId) {
      return res.status(400).json({ message: 'Only STAFF can have a manager' });
    }

    // Validate manager exists and is active
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

    // Validate warehouse exists if provided
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: parseInt(warehouseId) }
      });
      
      if (!warehouse) {
        return res.status(400).json({ message: 'Warehouse not found' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user data object
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
    };

    // Add manager connection if STAFF
    if (role === 'STAFF' && managerId) {
      userData.manager = { connect: { id: parseInt(managerId) } };
    }

    // Add warehouse connection if provided
    if (warehouseId) {
      userData.warehouse = { connect: { id: parseInt(warehouseId) } };
    }

    // Create user
    const user = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        manager: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, location: true } },
        createdAt: true
      }
    });

    res.status(201).json({ message: 'User created successfully', user });
  } catch (err) {
    console.error('Add user error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, managerId, warehouseId } = req.body;

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Role-specific validation
    if (role === 'STAFF' && !managerId) {
      return res.status(400).json({ message: 'STAFF role requires a manager' });
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

      // Prevent self-reference
      if (parseInt(managerId) === parseInt(id)) {
        return res.status(400).json({ message: 'User cannot be their own manager' });
      }
    }

    // Validate warehouse if provided
    if (warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: parseInt(warehouseId) }
      });
      
      if (!warehouse) {
        return res.status(400).json({ message: 'Warehouse not found' });
      }
    }

    // Build update data
    const updateData = {
      name,
      email,
      role,
    };

    // Handle manager relationship
    if (role === 'STAFF') {
      if (managerId) {
        updateData.manager = { connect: { id: parseInt(managerId) } };
      }
    } else {
      // If not STAFF, disconnect manager
      updateData.manager = { disconnect: true };
    }

    // Handle warehouse relationship
    if (warehouseId) {
      updateData.warehouse = { connect: { id: parseInt(warehouseId) } };
    } else {
      // Disconnect warehouse if not provided
      updateData.warehouse = { disconnect: true };
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        manager: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, location: true } },
        createdAt: true
      }
    });

    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    console.error('Update user error:', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Email already exists. Please use a different email.' });
    }
    
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(500).json({ message: 'Error updating user', error: err.message });
  }
};

// Toggle user status (Activate/Deactivate)
export const toggleUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deactivating the last admin
    if (!status && existingUser.role === 'ADMIN') {
      const activeAdmins = await prisma.user.count({
        where: {
          role: 'ADMIN',
          status: true,
          id: { not: parseInt(id) }
        }
      });

      if (activeAdmins === 0) {
        return res.status(400).json({ message: 'Cannot deactivate the last active admin' });
      }
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        manager: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      }
    });

    res.json({ 
      message: `User ${status ? 'activated' : 'deactivated'} successfully`, 
      user 
    });
  } catch (err) {
    console.error('Toggle status error:', err);
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// Delete user (hard delete)
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting the last admin
    if (existingUser.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' }
      });

      if (adminCount === 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin' });
      }
    }

    // Check if user has dependencies (e.g., staff members)
    const hasStaff = await prisma.user.count({
      where: { managerId: parseInt(id) }
    });

    if (hasStaff > 0) {
      return res.status(400).json({ 
        message: `Cannot delete user. They manage ${hasStaff} staff member(s). Please reassign them first.` 
      });
    }

    await prisma.user.delete({ 
      where: { id: parseInt(id) } 
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(500).json({ message: 'Error deleting user', error: err.message });
  }
};