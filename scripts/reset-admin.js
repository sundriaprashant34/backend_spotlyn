import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const backendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(backendDir, '.env') });

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before resetting the admin account.');
}
if (password.length < 8) {
  throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
}
if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI must be set before resetting the admin account.');
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await User.findOne({ email });

  if (admin && admin.role !== 'ADMIN') {
    throw new Error('The configured ADMIN_EMAIL belongs to a non-admin account.');
  }

  if (admin) {
    admin.passwordHash = passwordHash;
    admin.active = true;
    await admin.save();
  } else {
    await User.create({
      name: process.env.ADMIN_NAME?.trim() || 'Spotlyn Admin',
      email,
      passwordHash,
      role: 'ADMIN',
      department: 'Administration',
    });
  }

  console.log('Admin account reset completed.');
} finally {
  await mongoose.disconnect();
}
