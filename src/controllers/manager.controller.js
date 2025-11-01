// controllers/manager.controller.js
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get manager's team (staff reporting to this manager)
export const getMyTeam = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    console.log('🔍 DEBUG - Logged in user ID:', loggedInUserId);

    // First, get the logged-in user details
    const currentUser = await prisma.user.findUnique({
      where: { id: loggedInUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    console.log('🔍 DEBUG - Current user:', currentUser);

    // Get ALL users to see the data
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        managerId: true,
        status: true,
        role: true
      }
    });

    console.log('🔍 DEBUG - All users:', JSON.stringify(allUsers, null, 2));

    // Get staff where their managerId equals the logged-in manager's ID
    const staff = await prisma.user.findMany({
      where: {
        managerId: loggedInUserId, // Staff assigned to this manager
        status: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        managerId: true,
        warehouseId: true,
        warehouse: {
          select: {
            name: true,
            location: true
          }
        },
        createdAt: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log('🔍 DEBUG - Filtered staff:', JSON.stringify(staff, null, 2));
    console.log('🔍 DEBUG - Staff count:', staff.length);

    res.status(200).json(staff);
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch team', 
      error: err.message 
    });
  }
};

// Get warehouses managed by this manager
export const getMyWarehouses = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    // Get warehouses where the logged-in user is the manager
    const warehouses = await prisma.warehouse.findMany({
      where: {
        managerId: loggedInUserId, // Warehouses managed by this user
        status: true
      },
      include: {
        inventoryItems: {
          select: {
            id: true,
            quantity: true
          }
        },
        users: {
          where: { status: true },
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        _count: {
          select: {
            sales: true,
            transferRequestsFrom: true,
            transferRequestsTo: true
          }
        }
      }
    });

    const formattedWarehouses = warehouses.map(wh => ({
      id: wh.id,
      name: wh.name,
      location: wh.location,
      status: wh.status,
      totalInventoryItems: wh.inventoryItems.length,
      totalStock: wh.inventoryItems.reduce((sum, item) => sum + item.quantity, 0),
      staffCount: wh.users.length,
      salesCount: wh._count.sales,
      transfersCount: wh._count.transferRequestsFrom + wh._count.transferRequestsTo
    }));

    res.status(200).json(formattedWarehouses);
  } catch (err) {
    console.error('Get warehouses error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch warehouses', 
      error: err.message 
    });
  }
};

// Get comprehensive dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;
    const { warehouseId, startDate, endDate } = req.query;

    // Build where clause for warehouses managed by this user
    const warehouseWhere = {
      managerId: loggedInUserId, // Only warehouses where this user is the manager
      status: true
    };

    if (warehouseId) {
      warehouseWhere.id = parseInt(warehouseId);
    }

    // Get managed warehouses
    const warehouses = await prisma.warehouse.findMany({
      where: warehouseWhere,
      select: { id: true }
    });

    const warehouseIds = warehouses.map(w => w.id);

    if (warehouseIds.length === 0) {
      return res.status(200).json({
        teamMetrics: { totalStaff: 0, activeToday: 0, avgProductivity: 0, teamAccuracy: 0, completedTasks: 0, pendingTasks: 0 },
        operationalKPIs: { orderFulfillment: 0, inventoryTurnover: 0, stockAccuracy: 0, customerSatisfaction: 0, costEfficiency: 0, processOptimization: 0 },
        salesMetrics: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0 },
        inventoryMetrics: { totalProducts: 0, lowStockItems: 0, stockAccuracy: 0 },
        operationalMetrics: { pendingTransfers: 0, completedTransfers: 0 }
      });
    }

    // Date range filter
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    // Team Metrics - Count staff assigned to this manager
    const totalStaff = await prisma.user.count({
      where: { 
        managerId: loggedInUserId, // Staff where managerId equals this user's ID
        status: true 
      }
    });

    // Debug: Log the count
    console.log(`🔍 Manager ID: ${loggedInUserId}, Total Staff Count: ${totalStaff}`);

    // Sales Metrics
    const salesWhere = {
      warehouseId: { in: warehouseIds },
      status: 'COMPLETED'
    };
    if (Object.keys(dateFilter).length > 0) {
      salesWhere.createdAt = dateFilter;
    }

    const salesStats = await prisma.sale.aggregate({
      where: salesWhere,
      _count: { id: true },
      _sum: { total: true }
    });

    const totalSalesItems = await prisma.saleItem.aggregate({
      where: {
        sale: salesWhere
      },
      _sum: { quantity: true }
    });

    // Inventory Metrics
    const inventoryStats = await prisma.warehouseInventory.findMany({
      where: {
        warehouseId: { in: warehouseIds }
      },
      include: {
        inventory: {
          select: {
            minStock: true
          }
        }
      }
    });

    const totalProducts = inventoryStats.length;
    const lowStockItems = inventoryStats.filter(
      item => item.quantity <= item.inventory.minStock
    ).length;

    // Transfer Requests
    const pendingTransfers = await prisma.transferRequest.count({
      where: {
        OR: [
          { fromWarehouseId: { in: warehouseIds } },
          { toWarehouseId: { in: warehouseIds } }
        ],
        status: 'PENDING'
      }
    });

    const completedTransfers = await prisma.transferRequest.count({
      where: {
        OR: [
          { fromWarehouseId: { in: warehouseIds } },
          { toWarehouseId: { in: warehouseIds } }
        ],
        status: 'COMPLETED',
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
      }
    });

    res.status(200).json({
      teamMetrics: {
        totalStaff,
        activeToday: totalStaff, // You can enhance this with actual login tracking
        avgProductivity: totalSalesItems._sum.quantity 
          ? Math.min(100, (totalSalesItems._sum.quantity / Math.max(1, totalStaff)) * 5)
          : 0,
        teamAccuracy: 96.2, // This can be calculated based on error logs
        completedTasks: salesStats._count.id + completedTransfers,
        pendingTasks: pendingTransfers
      },
      operationalKPIs: {
        orderFulfillment: salesStats._count.id > 0 
          ? Math.min(100, (salesStats._count.id / (salesStats._count.id + pendingTransfers)) * 100)
          : 0,
        inventoryTurnover: totalSalesItems._sum.quantity || 0,
        stockAccuracy: totalProducts > 0 
          ? ((totalProducts - lowStockItems) / totalProducts) * 100
          : 0,
        customerSatisfaction: 92.0, // Can be enhanced with customer feedback
        costEfficiency: 85.3, // Can be calculated from expense data
        processOptimization: completedTransfers > 0 
          ? (completedTransfers / (completedTransfers + pendingTransfers)) * 100
          : 0
      },
      salesMetrics: {
        totalSales: salesStats._count.id || 0,
        totalRevenue: parseFloat(salesStats._sum.total || 0),
        totalItemsSold: totalSalesItems._sum.quantity || 0
      },
      inventoryMetrics: {
        totalProducts,
        lowStockItems,
        stockAccuracy: totalProducts > 0 
          ? ((totalProducts - lowStockItems) / totalProducts) * 100
          : 0
      },
      operationalMetrics: {
        pendingTransfers,
        completedTransfers
      }
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch dashboard statistics', 
      error: err.message 
    });
  }
};

// Get team performance with individual metrics
export const getTeamPerformance = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    // Get team members where their managerId equals logged-in user's ID
    const teamMembers = await prisma.user.findMany({
      where: {
        managerId: loggedInUserId, // Staff assigned to this manager
        status: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        warehouse: {
          select: {
            name: true
          }
        }
      }
    });

    // Get performance data for each team member
    const performanceData = await Promise.all(
      teamMembers.map(async (member) => {
        const salesCount = await prisma.sale.count({
          where: {
            createdById: member.id,
            status: 'COMPLETED',
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
          }
        });

        const transfersCount = await prisma.transferRequest.count({
          where: {
            createdById: member.id,
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
          }
        });

        const totalTasks = salesCount + transfersCount;
        const accuracy = totalTasks > 0 ? 95 + Math.random() * 5 : 0; // Simulated, enhance with real data
        const efficiency = totalTasks > 0 ? 85 + Math.random() * 10 : 0; // Simulated

        let status = 'average';
        if (efficiency >= 93 && accuracy >= 97) status = 'excellent';
        else if (efficiency >= 88 && accuracy >= 95) status = 'good';
        else if (efficiency < 80 || accuracy < 90) status = 'needs_improvement';

        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          warehouse: member.warehouse?.name || 'Unassigned',
          tasksCompleted: totalTasks,
          salesCompleted: salesCount,
          transfersCompleted: transfersCount,
          accuracy: parseFloat(accuracy.toFixed(1)),
          efficiency: parseFloat(efficiency.toFixed(0)),
          status
        };
      })
    );

    res.status(200).json(performanceData);
  } catch (err) {
    console.error('Get team performance error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch team performance', 
      error: err.message 
    });
  }
};

// Get weekly trends for the past 7 days
export const getWeeklyTrends = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    // Get warehouses managed by this user
    const warehouses = await prisma.warehouse.findMany({
      where: { 
        managerId: loggedInUserId, // Only warehouses where this user is the manager
        status: true 
      },
      select: { id: true }
    });

    const warehouseIds = warehouses.map(w => w.id);

    if (warehouseIds.length === 0) {
      return res.status(200).json([]);
    }

    // Get data for last 7 days
    const trends = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const salesCount = await prisma.sale.count({
        where: {
          warehouseId: { in: warehouseIds },
          status: 'COMPLETED',
          createdAt: { gte: startOfDay, lte: endOfDay }
        }
      });

      const salesSum = await prisma.sale.aggregate({
        where: {
          warehouseId: { in: warehouseIds },
          status: 'COMPLETED',
          createdAt: { gte: startOfDay, lte: endOfDay }
        },
        _sum: { total: true }
      });

      trends.push({
        day: days[startOfDay.getDay()],
        date: startOfDay.toISOString().split('T')[0],
        orders: salesCount,
        revenue: parseFloat(salesSum._sum.total || 0),
        productivity: Math.min(100, salesCount * 3 + Math.random() * 10),
        efficiency: Math.min(100, salesCount * 2.5 + Math.random() * 15),
        accuracy: 94 + Math.random() * 4
      });
    }

    res.status(200).json(trends);
  } catch (err) {
    console.error('Get weekly trends error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch weekly trends', 
      error: err.message 
    });
  }
};

// Get pending transfer requests
export const getPendingTransfers = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    // Get warehouses managed by this user
    const warehouses = await prisma.warehouse.findMany({
      where: { 
        managerId: loggedInUserId, // Only warehouses where this user is the manager
        status: true 
      },
      select: { id: true }
    });

    const warehouseIds = warehouses.map(w => w.id);

    const transfers = await prisma.transferRequest.findMany({
      where: {
        OR: [
          { fromWarehouseId: { in: warehouseIds } },
          { toWarehouseId: { in: warehouseIds } }
        ],
        status: 'PENDING'
      },
      include: {
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: {
          include: {
            inventory: { select: { name: true, sku: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(transfers);
  } catch (err) {
    console.error('Get pending transfers error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch pending transfers', 
      error: err.message 
    });
  }
};

// Get recent activities
export const getRecentActivities = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // Get warehouses managed by this user
    const warehouses = await prisma.warehouse.findMany({
      where: { 
        managerId: loggedInUserId, // Only warehouses where this user is the manager
        status: true 
      },
      select: { id: true }
    });

    const warehouseIds = warehouses.map(w => w.id);

    // Get recent sales
    const recentSales = await prisma.sale.findMany({
      where: { warehouseId: { in: warehouseIds } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        warehouse: { select: { name: true } }
      }
    });

    // Get recent transfers
    const recentTransfers = await prisma.transferRequest.findMany({
      where: {
        OR: [
          { fromWarehouseId: { in: warehouseIds } },
          { toWarehouseId: { in: warehouseIds } }
        ]
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        createdBy: { select: { name: true } }
      }
    });

    // Combine and sort activities
    const activities = [
      ...recentSales.map(sale => ({
        type: 'SALE',
        id: sale.id,
        description: `Sale ${sale.saleNumber} completed`,
        amount: parseFloat(sale.total),
        user: sale.createdBy.name,
        warehouse: sale.warehouse.name,
        status: sale.status,
        createdAt: sale.createdAt
      })),
      ...recentTransfers.map(transfer => ({
        type: 'TRANSFER',
        id: transfer.id,
        description: `Transfer from ${transfer.fromWarehouse.name} to ${transfer.toWarehouse.name}`,
        user: transfer.createdBy.name,
        status: transfer.status,
        createdAt: transfer.createdAt
      }))
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.status(200).json(activities);
  } catch (err) {
    console.error('Get recent activities error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch recent activities', 
      error: err.message 
    });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    // Get warehouses managed by this user
    const warehouses = await prisma.warehouse.findMany({
      where: { 
        managerId: loggedInUserId, // Only warehouses where this user is the manager
        status: true 
      },
      select: { id: true, name: true }
    });

    const warehouseIds = warehouses.map(w => w.id);

    const lowStockItems = await prisma.warehouseInventory.findMany({
      where: {
        warehouseId: { in: warehouseIds }
      },
      include: {
        inventory: {
          select: {
            id: true,
            name: true,
            sku: true,
            minStock: true,
            unit: true
          }
        },
        warehouse: {
          select: {
            name: true,
            location: true
          }
        }
      }
    });

    const alerts = lowStockItems
      .filter(item => item.quantity <= item.inventory.minStock)
      .map(item => ({
        inventoryId: item.inventory.id,
        name: item.inventory.name,
        sku: item.inventory.sku,
        currentStock: item.quantity,
        minStock: item.inventory.minStock,
        unit: item.inventory.unit,
        warehouse: item.warehouse.name,
        warehouseLocation: item.warehouse.location,
        severity: item.quantity === 0 ? 'critical' : 
                 item.quantity < item.inventory.minStock * 0.5 ? 'high' : 'medium'
      }));

    res.status(200).json(alerts);
  } catch (err) {
    console.error('Get low stock alerts error:', err);
    res.status(500).json({ 
      message: 'Failed to fetch low stock alerts', 
      error: err.message 
    });
  }
};