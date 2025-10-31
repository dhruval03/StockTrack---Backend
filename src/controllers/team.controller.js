class TeamManagementController {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
    this.teamMembers = [];
    this.departments = [];
    this.activities = [];
    this.performanceData = [];
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  async fetchTeamMembers(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await fetch(`${this.apiBaseUrl}/team/members?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch team members');
      }
      
      const data = await response.json();
      this.teamMembers = data.members;
      this.emit('membersUpdated', this.teamMembers);
      
      return {
        success: true,
        data: this.teamMembers
      };
    } catch (error) {
      console.error('Error fetching team members:', error);
      this.emit('error', { message: error.message, context: 'fetchTeamMembers' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async addTeamMember(memberData) {
    try {
      // Validate required fields
      const requiredFields = ['name', 'email', 'phone', 'role', 'department', 'location', 'shift'];
      const missingFields = requiredFields.filter(field => !memberData[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate email format
      if (!this.validateEmail(memberData.email)) {
        throw new Error('Invalid email format');
      }

      // Validate phone format
      if (!this.validatePhone(memberData.phone)) {
        throw new Error('Invalid phone format');
      }

      const response = await fetch(`${this.apiBaseUrl}/team/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...memberData,
          status: 'active',
          joinDate: new Date().toISOString(),
          performance: 0,
          tasksCompleted: 0,
          permissions: this.getDefaultPermissions(memberData.role)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add team member');
      }

      const result = await response.json();
      this.teamMembers.push(result.member);
      
      this.emit('memberAdded', result.member);
      this.emit('membersUpdated', this.teamMembers);
      
      // Log activity
      await this.logActivity({
        action: 'add_member',
        userId: result.member.id,
        description: `New member ${memberData.name} added to ${memberData.department}`
      });

      return {
        success: true,
        data: result.member
      };
    } catch (error) {
      console.error('Error adding team member:', error);
      this.emit('error', { message: error.message, context: 'addTeamMember' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateTeamMember(memberId, updates) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/members/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update team member');
      }

      const result = await response.json();
      const index = this.teamMembers.findIndex(m => m.id === memberId);
      
      if (index !== -1) {
        this.teamMembers[index] = { ...this.teamMembers[index], ...result.member };
      }

      this.emit('memberUpdated', result.member);
      this.emit('membersUpdated', this.teamMembers);

      // Log activity
      await this.logActivity({
        action: 'update_member',
        userId: memberId,
        description: `Member profile updated: ${Object.keys(updates).join(', ')}`
      });

      return {
        success: true,
        data: result.member
      };
    } catch (error) {
      console.error('Error updating team member:', error);
      this.emit('error', { message: error.message, context: 'updateTeamMember' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteTeamMember(memberId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/members/${memberId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete team member');
      }

      this.teamMembers = this.teamMembers.filter(m => m.id !== memberId);
      
      this.emit('memberDeleted', memberId);
      this.emit('membersUpdated', this.teamMembers);

      // Log activity
      await this.logActivity({
        action: 'delete_member',
        userId: memberId,
        description: `Team member removed`
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting team member:', error);
      this.emit('error', { message: error.message, context: 'deleteTeamMember' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateMemberStatus(memberId, status) {
    try {
      const validStatuses = ['active', 'inactive', 'on_leave'];
      
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
      }

      return await this.updateTeamMember(memberId, { status });
    } catch (error) {
      console.error('Error updating member status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async fetchPerformanceData(period = 'monthly') {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/performance?period=${period}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch performance data');
      }

      const data = await response.json();
      this.performanceData = data.performance;
      this.emit('performanceUpdated', this.performanceData);

      return {
        success: true,
        data: this.performanceData
      };
    } catch (error) {
      console.error('Error fetching performance data:', error);
      this.emit('error', { message: error.message, context: 'fetchPerformanceData' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateMemberPerformance(memberId, performanceData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/members/${memberId}/performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(performanceData)
      });

      if (!response.ok) {
        throw new Error('Failed to update performance');
      }

      const result = await response.json();
      
      // Update local member data
      const member = this.teamMembers.find(m => m.id === memberId);
      if (member) {
        member.performance = result.performance;
        member.tasksCompleted = result.tasksCompleted;
      }

      this.emit('performanceUpdated', result);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error updating performance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculateTeamStatistics() {
    const stats = {
      totalMembers: this.teamMembers.length,
      activeMembers: this.teamMembers.filter(m => m.status === 'active').length,
      inactiveMembers: this.teamMembers.filter(m => m.status === 'inactive').length,
      onLeave: this.teamMembers.filter(m => m.status === 'on_leave').length,
      newHires: this.teamMembers.filter(m => {
        const joinDate = new Date(m.joinDate);
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return joinDate > monthAgo;
      }).length,
      performanceScore: 0,
      completionRate: 0,
      responseTime: 0
    };

    // Calculate average performance
    if (stats.totalMembers > 0) {
      stats.performanceScore = this.teamMembers.reduce((sum, m) => sum + m.performance, 0) / stats.totalMembers;
    }

    // Calculate average task completion rate
    const totalTasks = this.teamMembers.reduce((sum, m) => sum + m.tasksCompleted, 0);
    stats.completionRate = totalTasks > 0 ? (totalTasks / (stats.totalMembers * 100)) * 100 : 0;

    return stats;
  }

  getTopPerformers(limit = 5) {
    return [...this.teamMembers]
      .sort((a, b) => b.performance - a.performance)
      .slice(0, limit);
  }

  getDepartmentStatistics() {
    const deptMap = new Map();

    this.teamMembers.forEach(member => {
      if (!deptMap.has(member.department)) {
        deptMap.set(member.department, {
          department: member.department,
          members: 0,
          totalPerformance: 0,
          performance: 0
        });
      }

      const dept = deptMap.get(member.department);
      dept.members++;
      dept.totalPerformance += member.performance;
    });

    const departments = Array.from(deptMap.values());
    departments.forEach(dept => {
      dept.performance = dept.members > 0 ? dept.totalPerformance / dept.members : 0;
    });

    return departments;
  }

  async fetchActivities(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await fetch(`${this.apiBaseUrl}/team/activities?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();
      this.activities = data.activities;
      this.emit('activitiesUpdated', this.activities);

      return {
        success: true,
        data: this.activities
      };
    } catch (error) {
      console.error('Error fetching activities:', error);
      this.emit('error', { message: error.message, context: 'fetchActivities' });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async logActivity(activityData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...activityData,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to log activity');
      }

      const result = await response.json();
      this.activities.unshift(result.activity);
      this.emit('activityAdded', result.activity);

      return {
        success: true,
        data: result.activity
      };
    } catch (error) {
      console.error('Error logging activity:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateMemberPermissions(memberId, permissions) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/members/${memberId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permissions })
      });

      if (!response.ok) {
        throw new Error('Failed to update permissions');
      }

      const result = await response.json();
      
      const member = this.teamMembers.find(m => m.id === memberId);
      if (member) {
        member.permissions = result.permissions;
      }

      this.emit('permissionsUpdated', { memberId, permissions: result.permissions });

      return {
        success: true,
        data: result.permissions
      };
    } catch (error) {
      console.error('Error updating permissions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getDefaultPermissions(role) {
    const permissionMap = {
      'Warehouse Manager': ['inventory_write', 'reports_read', 'team_read', 'orders_write'],
      'Stock Analyst': ['reports_write', 'analytics_read', 'inventory_read'],
      'Inventory Clerk': ['inventory_read', 'orders_read'],
      'Quality Controller': ['quality_write', 'reports_read', 'inventory_read'],
      'Logistics Coordinator': ['logistics_write', 'tracking_read', 'reports_read'],
      'Purchase Manager': ['procurement_write', 'vendor_manage', 'budget_read', 'reports_read']
    };

    return permissionMap[role] || ['basic_read'];
  }

  searchMembers(searchTerm, filters = {}) {
    let results = [...this.teamMembers];

    // Search by name, email, or role
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(member =>
        member.name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term) ||
        member.role.toLowerCase().includes(term)
      );
    }

    // Filter by role
    if (filters.role && filters.role !== 'all') {
      results = results.filter(member =>
        member.role.toLowerCase().includes(filters.role.toLowerCase())
      );
    }

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      results = results.filter(member => member.status === filters.status);
    }

    // Filter by department
    if (filters.department) {
      results = results.filter(member => member.department === filters.department);
    }

    // Filter by location
    if (filters.location) {
      results = results.filter(member => member.location === filters.location);
    }

    return results;
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  validatePhone(phone) {
    const phoneRegex = /^\+?[\d\s-()]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  async bulkUpdateStatus(memberIds, status) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/members/bulk-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberIds,
          updates: { status }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to bulk update members');
      }

      const result = await response.json();
      
      // Update local data
      memberIds.forEach(id => {
        const member = this.teamMembers.find(m => m.id === id);
        if (member) {
          member.status = status;
        }
      });

      this.emit('membersUpdated', this.teamMembers);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error bulk updating members:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportTeamData(format = 'csv') {
    try {
      const response = await fetch(`${this.apiBaseUrl}/team/export?format=${format}`);
      
      if (!response.ok) {
        throw new Error('Failed to export team data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team_data_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return {
        success: true
      };
    } catch (error) {
      console.error('Error exporting team data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getActivityStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActivities = this.activities.filter(activity => {
      const activityDate = new Date(activity.timestamp);
      return activityDate >= today;
    });

    const activeToday = new Set(todayActivities.map(a => a.userId)).size;

    return {
      totalToday: todayActivities.length,
      activeMembers: activeToday,
      activityIncrease: this.calculateActivityIncrease()
    };
  }

  calculateActivityIncrease() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const todayCount = this.activities.filter(a => {
      const date = new Date(a.timestamp);
      return date >= today;
    }).length;

    const yesterdayCount = this.activities.filter(a => {
      const date = new Date(a.timestamp);
      return date >= yesterday && date < today;
    }).length;

    if (yesterdayCount === 0) return 0;
    return ((todayCount - yesterdayCount) / yesterdayCount) * 100;
  }

  async initialize() {
    try {
      await Promise.all([
        this.fetchTeamMembers(),
        this.fetchActivities(),
        this.fetchPerformanceData()
      ]);

      this.emit('initialized', {
        members: this.teamMembers,
        activities: this.activities,
        performance: this.performanceData
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error initializing controller:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TeamManagementController;
}
