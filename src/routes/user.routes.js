import express from 'express';
import { protect, authorizeRoles } from '../middleware/roleMiddleware.js';
import { getAllUsers,addUser, updateUser, toggleUserStatus, deleteUser } from '../controllers/user.controller.js';

const router = express.Router();

router.use(protect, authorizeRoles('ADMIN'));
router.get('/user/all', getAllUsers);
router.post('/user/add', addUser);
router.put('/user/:id', updateUser);
router.patch('/user/:id/status', toggleUserStatus);
router.delete('/user/:id', deleteUser);

export default router;
