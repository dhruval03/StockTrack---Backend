import bcrypt from 'bcrypt';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, status:true, manager: { select: { id: true, name: true } }, createdAt: true }
    });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Add user
export const addUser = async (req, res) => {
  try {
    const { name, email, password, role, managerId } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    if (role === 'STAFF' && !managerId) {
      return res.status(400).json({ message: 'STAFF must have a managerId' });
    }
    if (role !== 'STAFF' && managerId) {
      return res.status(400).json({ message: 'Only STAFF can have a managerId' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        manager: role === 'STAFF' && managerId ? { connect: { id: managerId } } : undefined,
      },
    });

    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, managerId } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        name,
        email,
        role,
        manager: role === 'STAFF' ? { connect: { id: managerId } } : { disconnect: true },
      },
    });

    res.json({ message: 'User updated', user });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Email already exists. Please use a different email.' });
    }
    res.status(500).json({ message: 'Error updating user', error: err.message });
  }
};


// 🔄 Activate/Deactivate user
export const toggleUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json({ message: `User ${status ? 'activated' : 'deactivated'}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Error changing status', error: err.message });
  }
};

// ❌ Delete user (hard delete)
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user', error: err.message });
  }
};
