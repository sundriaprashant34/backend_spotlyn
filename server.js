import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import './config/cloudinary.js';
import authRoutes from './routes/auth.js';
import complaintRoutes from './routes/complaints.js';
import userRoutes from './routes/users.js';
import lostFoundRoutes from './routes/lostfound.js';
import adminRoutes from './routes/admin.js';
import User from './models/User.js';
import Department from './models/Department.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const app = express();
const getDatabaseStatus = () => {
  const readyState = mongoose.connection.readyState;
  if (readyState === 1) return { connected: true, status: 'connected' };
  if (readyState === 2) return { connected: false, status: 'connecting' };
  if (readyState === 3) return { connected: false, status: 'disconnecting' };
  return { connected: false, status: 'disconnected' };
};
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));
app.get('/', (_req, res) =>
  res.json({
    service: 'Spotlyn API',
    message: 'Backend is running.',
    health: '/api/health',
  })
);
app.get('/api/health', (_q, res) =>
  res.json({
    ok: mongoose.connection.readyState === 1,
    service: 'Spotlyn API',
    database: getDatabaseStatus(),
  })
);
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lost-found', lostFoundRoutes);
app.use('/api/admin', adminRoutes);
app.use((err, _q, res, _n) => {
  const status = err instanceof multer.MulterError ? 400 : err.statusCode || 500;
  const message =
    err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5 MB or smaller.'
      : err.message || 'Server error';
  res.status(status).json({ message });
});
async function seedUser({ email, password, ...user }) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password || (await User.exists({ email: normalizedEmail }))) return;
  await User.create({
    ...user,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
  });
}
async function seed() {
  await seedUser({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: 'Spotlyn Admin',
    role: 'ADMIN',
    department: 'Administration',
  });
  for (const name of [
    'IT / Computer Lab',
    'Electrical / Maintenance',
    'Infrastructure',
    'IT / Network',
    'Administration',
  ])
    await Department.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  await seedUser({
    email: process.env.STAFF_EMAIL,
    password: process.env.STAFF_PASSWORD,
    name: 'Demo Lab Technician',
    role: 'STAFF',
    staffDepartment: 'IT / Computer Lab',
  });
}
const port = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spotlyn')
  .then(async () => {
    await seed();
    app.listen(port, () => console.log(`Spotlyn API running on http://localhost:${port}`));
  })
  .catch((e) => {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  });
