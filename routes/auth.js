import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { sendFirstLoginWelcomeEmail } from '../utils/brevo.js';
const r = express.Router();
const safe = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  department: u.department,
  role: u.role,
  staffDesignation: u.staffDesignation,
  staffDepartment: u.staffDepartment,
});
const token = (u) =>
  jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
r.post('/register', async (req, res) => {
  try {
    const { name, email, phone, department, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ message: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const u = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      department,
      passwordHash: hash,
      role: 'STUDENT',
    });
    res.status(201).json({ token: token(u), user: safe(u) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
r.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const normalizedIdentifier = String(identifier || '').trim();
    if (!normalizedIdentifier || !password)
      return res.status(400).json({ message: 'Email and password are required' });
    const u = await User.findOne({ email: normalizedIdentifier.toLowerCase() });
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash)))
      return res.status(401).json({ message: 'Invalid login details' });
    const isFirstLogin = u.loginCount === 0;
    u.lastLoginAt = new Date();
    u.loginCount += 1;
    await u.save();

    if (isFirstLogin && u.role === 'STUDENT') {
      try {
        await sendFirstLoginWelcomeEmail(u);
      } catch (error) {
        console.warn('Failed to send first-login email:', error.message);
      }
    }

    res.json({ token: token(u), user: safe(u) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
r.get('/me', auth, (req, res) => res.json({ user: req.user }));
export default r;
