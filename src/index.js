import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import warehouseRoutes from './routes/warehouse.routes.js'
import categoryRoutes from './routes/category.routes.js'
import inventoryRoutes from './routes/inventory.routes.js'
import transferRequestRoutes from './routes/transferRequest.routes.js'
import managerStatsRoutes from'./routes/stats.routes.js'

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', userRoutes);
app.use('/api/admin', warehouseRoutes);
app.use('/api/manager', managerStatsRoutes);
app.use('/api', categoryRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', transferRequestRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`StockTrack backend running on port ${PORT}`));