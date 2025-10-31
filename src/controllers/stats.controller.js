import { PrismaClient } from '../../generated/prisma/index.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Get team statistics
export const getTeamStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Count all users or only managed users based on role
    const whereClause = userRole === 'MANAGER' 
      ? { managerId: userId }
      : {};

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleCounts,
      usersWithWarehouse,
      usersWithoutWarehouse,
      staffWithManager,
      staffWithoutManager
    ] = await Promise.all([
      // Total users
      prisma.user.count({ where: whereClause }),
      
      // Active users
      prisma.user.count({
        where: { ...whereClause, status: true }
      }),
      
      // Inactive users
      prisma.user.count({
        where: { ...whereClause, status: false }
      }),
      
      // Role counts
      prisma.user.groupBy({
        by: ['role'],
        where: whereClause,
        _count: true
      }),
      
      // Users with warehouse
      prisma.user.count({
        where: {
          ...whereClause,
          warehouseId: { not: null }
        }
      }),
      
      // Users without warehouse
      prisma.user.count({
        where: {
          ...whereClause,
          warehouseId: null
        }
      }),
      
      // Staff with manager
      prisma.user.count({
        where: {
          role: 'STAFF',
          managerId: { not: null }
        }
      }),
      
      // Staff without manager
      prisma.user.count({
        where: {
          role: 'STAFF',
          managerId: null
        }
      })
    ]);

    // Format role counts
    const roleCountsFormatted = {
      ADMIN: 0,
      MANAGER: 0,
      STAFF: 0
    };
    
    roleCounts.forEach(item => {
      roleCountsFormatted[item.role] = item._count;
    });

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      roleCounts: roleCountsFormatted,
      usersWithWarehouse,
      usersWithoutWarehouse,
      staffWithManager,
      staffWithoutManager
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({ message: 'Error fetching team statistics', error: error.message });
  }
};

// Get warehouse statistics
export const getWarehouseStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get warehouses based on role
    const whereClause = userRole === 'MANAGER'
      ? { managerId: userId }
      : {};

    const [totalWarehouses, warehousesWithUsers] = await Promise.all([
      prisma.warehouse.count({ where: whereClause }),
      
      prisma.warehouse.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { users: true }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { name: 'asc' }
      })
    ]);

    res.json({
      totalWarehouses,
      warehousesWithUsers
    });
  } catch (error) {
    console.error('Error fetching warehouse stats:', error);
    res.status(500).json({ message: 'Error fetching warehouse statistics', error: error.message });
  }
};

// Get recent activity (recent users)
export const getRecentActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const limit = parseInt(req.query.limit) || 10;

    const whereClause = userRole === 'MANAGER'
      ? { managerId: userId }
      : {};

    const recentUsers = await prisma.user.findMany({
      where: whereClause,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Remove password from response
    const sanitizedUsers = recentUsers.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({
      recentUsers: sanitizedUsers
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ message: 'Error fetching recent activity', error: error.message });
  }
};

// Get list of all managers
export const getManagersList = async (req, res) => {
  try {
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ['MANAGER', 'ADMIN'] }
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        _count: {
          select: {
            staffList: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Remove passwords
    const sanitizedManagers = managers.map(manager => {
      const { password, ...managerWithoutPassword } = manager;
      return managerWithoutPassword;
    });

    res.json(sanitizedManagers);
  } catch (error) {
    console.error('Error fetching managers list:', error);
    res.status(500).json({ message: 'Error fetching managers', error: error.message });
  }
};

// Get staff members for a specific manager
export const getManagerStaff = async (req, res) => {
  try {
    const { managerId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Managers can only view their own staff, admins can view any
    if (requestingUserRole === 'MANAGER' && parseInt(managerId) !== requestingUserId) {
      return res.status(403).json({ message: 'Forbidden: You can only view your own staff' });
    }

    const manager = await prisma.user.findUnique({
      where: { id: parseInt(managerId) },
      include: {
        staffList: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                location: true
              }
            }
          },
          orderBy: { name: 'asc' }
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        }
      }
    });

    if (!manager) {
      return res.status(404).json({ message: 'Manager not found' });
    }

    // Remove password
    const { password, ...managerWithoutPassword } = manager;

    // Remove passwords from staff
    const sanitizedStaff = manager.staffList.map(staff => {
      const { password, ...staffWithoutPassword } = staff;
      return staffWithoutPassword;
    });

    res.json({
      ...managerWithoutPassword,
      staff: sanitizedStaff
    });
  } catch (error) {
    console.error('Error fetching manager staff:', error);
    res.status(500).json({ message: 'Error fetching manager staff', error: error.message });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        _count: {
          select: {
            staffList: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Managers can only view their own staff or themselves
    if (requestingUserRole === 'MANAGER') {
      if (user.managerId !== requestingUserId && parseInt(userId) !== requestingUserId) {
        return res.status(403).json({ message: 'Forbidden: You can only view your own staff' });
      }
    }

    // Remove password
    const { password, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

// Create new user
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, warehouseId, managerId, status } = req.body;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Role validation - managers can only create STAFF
    if (requestingUserRole === 'MANAGER' && role !== 'STAFF') {
      return res.status(403).json({ message: 'Managers can only create STAFF users' });
    }

    // If manager is creating a user, set themselves as the manager
    const finalManagerId = requestingUserRole === 'MANAGER' 
      ? requestingUserId 
      : (managerId ? parseInt(managerId) : null);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        status: status !== undefined ? status : true,
        warehouseId: warehouseId ? parseInt(warehouseId) : null,
        managerId: finalManagerId
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      message: 'User created successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, password, role, warehouseId, managerId, status } = req.body;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Managers can only update their own staff
    if (requestingUserRole === 'MANAGER') {
      if (existingUser.managerId !== requestingUserId && parseInt(userId) !== requestingUserId) {
        return res.status(403).json({ message: 'Forbidden: You can only update your own staff' });
      }
      
      // Managers cannot change roles
      if (role && role !== existingUser.role) {
        return res.status(403).json({ message: 'Managers cannot change user roles' });
      }
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });
      
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Build update data
    const updateData = {};
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (role && requestingUserRole === 'ADMIN') updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (warehouseId !== undefined) {
      updateData.warehouseId = warehouseId ? parseInt(warehouseId) : null;
    }
    if (managerId !== undefined && requestingUserRole === 'ADMIN') {
      updateData.managerId = managerId ? parseInt(managerId) : null;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: updateData,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json({
      message: 'User updated successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        _count: {
          select: {
            staffList: true,
            managedWarehouses: true
          }
        }
      }
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deletion
    if (parseInt(userId) === requestingUserId) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    // Managers can only delete their own staff
    if (requestingUserRole === 'MANAGER') {
      if (existingUser.managerId !== requestingUserId) {
        return res.status(403).json({ message: 'Forbidden: You can only delete your own staff' });
      }
    }

    // Check if user has dependencies
    if (existingUser._count.staffList > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete user: This user is a manager with assigned staff. Please reassign staff first.' 
      });
    }

    if (existingUser._count.managedWarehouses > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete user: This user manages warehouses. Please reassign warehouses first.' 
      });
    }

    // Delete user
    await prisma.user.delete({
      where: { id: parseInt(userId) }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

export default {
  getTeamStats,
  getWarehouseStats,
  getRecentActivity,
  getManagersList,
  getManagerStaff,
  createUser,
  updateUser,
  deleteUser,
  getUserById
};