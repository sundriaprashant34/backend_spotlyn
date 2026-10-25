import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import User from '../models/User.js';
import RegistrationOtp from '../models/RegistrationOtp.js';
import { auth } from '../middleware/auth.js';
import { sendFirstLoginWelcomeEmail, sendRegistrationOtpEmail } from '../utils/brevo.js';
const r = express.Router();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const hashOtp = (code, salt) => createHash('sha256').update(`${salt}:${code}`).digest();
const safe = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  profilePhoto: u.profilePhoto,
  department: u.department,
  role: u.role,
  staffDesignation: u.staffDesignation,
  staffDepartment: u.staffDepartment,
});
const token = (u) =>
  jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const sendWelcomeEmailIfNeeded = async (user) => {
  console.info('Checking student welcome email eligibility.', {
    role: user.role,
    alreadySent: user.welcomeEmailSent,
  });
  if (user.role !== 'STUDENT') {
    console.info('Skipping welcome email for non-student account.');
    return;
  }
  if (!user.emailVerified) {
    console.info('Skipping welcome email because the student email is not verified.');
    return;
  }
  if (user.welcomeEmailSent) {
    console.info('Skipping welcome email because it was already accepted.');
    return;
  }

  try {
    const sent = await sendFirstLoginWelcomeEmail(user);
    if (sent) {
      user.welcomeEmailSent = true;
      await user.save();
      console.info('Student welcome email status saved.');
    }
  } catch (error) {
    console.error('Failed to send first-login welcome email:', error);
  }
};
r.post('/register', async (req, res) => {
  try {
    const { name, email, phone, department, password } = req.body;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string'
    )
      return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail }))
      return res.status(409).json({ message: 'Email already registered' });

    const pending = await RegistrationOtp.findOne({ email: normalizedEmail });
    if (pending && Date.now() - pending.lastSentAt.getTime() < OTP_RESEND_DELAY_MS)
      return res.status(429).json({ message: 'Please wait before requesting another code.' });

    const code = String(randomInt(100000, 1000000));
    const otpSalt = randomBytes(16).toString('hex');
    const values = {
      name: name.trim(),
      phone: typeof phone === 'string' ? phone.trim() : '',
      department:
        typeof department === 'string' && department.trim()
          ? department.trim()
          : 'Computer Science',
      passwordHash: await bcrypt.hash(password, 12),
      otpHash: hashOtp(code, otpSalt).toString('hex'),
      otpSalt,
      attempts: 0,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    };
    await RegistrationOtp.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: values, $setOnInsert: { email: normalizedEmail } },
      { upsert: true, new: true, runValidators: true }
    );
    try {
      await sendRegistrationOtpEmail({ email: normalizedEmail, name: name.trim(), code });
    } catch (error) {
      console.error('Registration verification email could not be sent:', error.message);
      await RegistrationOtp.deleteOne({ email: normalizedEmail, otpHash: values.otpHash });
      if (error.code === 'MAIL_CONFIGURATION')
        return res.status(503).json({
          message:
            'Email verification is not configured. Add BREVO_API_KEY and a verified BREVO_FROM_EMAIL to backend/.env, then restart the backend.',
        });
      if (error.code === 'MAIL_IP_NOT_AUTHORIZED')
        return res.status(502).json({
          message:
            'Brevo blocked the email because this server IP is not authorised. Add the server outbound IP under Brevo Settings > Security > Authorised IPs, then try again.',
        });
      return res.status(502).json({
        message:
          'Brevo could not accept the verification email. Check the verified sender and Brevo transactional email logs.',
      });
    }
    res.status(200).json({
      message: 'Verification code sent to your email.',
      email: normalizedEmail,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
r.post('/register/verify', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (!email || !/^\d{6}$/.test(code))
      return res
        .status(400)
        .json({ message: 'A valid email and 6-digit verification code are required.' });

    const pending = await RegistrationOtp.findOne({ email });
    if (!pending)
      return res.status(400).json({ message: 'No active verification request was found.' });
    if (pending.expiresAt.getTime() <= Date.now()) {
      await pending.deleteOne();
      return res.status(400).json({ message: 'Verification code expired. Request a new code.' });
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS)
      return res.status(429).json({ message: 'Too many incorrect codes. Request a new code.' });

    const expected = Buffer.from(pending.otpHash, 'hex');
    const received = hashOtp(code, pending.otpSalt);
    if (!timingSafeEqual(expected, received)) {
      pending.attempts += 1;
      await pending.save();
      return res.status(400).json({ message: 'Incorrect verification code.' });
    }

    const user = await User.create({
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      department: pending.department,
      passwordHash: pending.passwordHash,
      role: 'STUDENT',
      emailVerified: true,
    });
    await pending.deleteOne();
    await sendWelcomeEmailIfNeeded(user);
    res.status(201).json({ token: token(user), user: safe(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Email already registered' });
    res.status(500).json({ message: error.message });
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
    u.lastLoginAt = new Date();
    u.loginCount += 1;
    await u.save();

    await sendWelcomeEmailIfNeeded(u);

    res.json({ token: token(u), user: safe(u) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
r.get('/me', auth, (req, res) => res.json({ user: req.user }));
export default r;
