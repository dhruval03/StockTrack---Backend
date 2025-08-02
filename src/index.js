import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', userRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`StockTrack backend running on port ${PORT}`));
