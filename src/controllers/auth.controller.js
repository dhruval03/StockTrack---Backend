import bcrypt from 'bcrypt';
import { PrismaClient } from '../../generated/prisma/index.js';
import { generateToken } from '../utils/jwt.js';

const prisma = new PrismaClient();

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

