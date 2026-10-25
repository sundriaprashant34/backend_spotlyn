import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { auth, roles } from '../middleware/auth.js';
import { imageUpload } from '../middleware/imageUpload.js';
import { STAFF_DESIGNATIONS, staffEmailCandidate } from '../utils/staff.js';
const r = express.Router();
r.put('/profile', auth, imageUpload.single('profilePhoto'), async (req, res) => {
  try {
    const updates = {};
    if (req.file?.path) updates.profilePhoto = req.file.path;
    if (typeof req.body.name === 'string') {
      if (!req.body.name.trim()) return res.status(400).json({ message: 'Name cannot be empty.' });
      updates.name = req.body.name.trim();
    }
    if (typeof req.body.phone === 'string') updates.phone = req.body.phone.trim();
    if (!Object.keys(updates).length)
      return res
        .status(400)
        .json({ message: 'Choose a profile photo or update your profile details.' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User account not found.' });
    res.json({ user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
async function uniqueStaffEmail(title, name, excludeId) {
  const existingUserFilter = excludeId ? { _id: { $ne: excludeId } } : {};
  for (let attempt = 0; ; attempt += 1) {
    const email = staffEmailCandidate(title, name, attempt);
    if (!(await User.exists({ email, ...existingUserFilter }))) return email;
  }
}

r.get('/staff', auth, roles('ADMIN'), async (_q, res) =>
  res.json(
    await User.find({ role: 'STAFF', active: true }).select(
      'name email staffDesignation staffDepartment'
    )
  )
);
r.get('/students', auth, roles('ADMIN'), async (_q, res) =>
  res.json(
    await User.find({ role: 'STUDENT', active: true }).select('-passwordHash').sort('-createdAt')
  )
);
r.put('/students/:id', auth, roles('ADMIN'), async (req, res) => {
  try {
    const { name, email, phone, department } = req.body;
    if (!name?.trim() || !email?.trim())
      return res.status(400).json({ message: 'Name and email are required' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail, _id: { $ne: req.params.id } }))
      return res.status(409).json({ message: 'Email already registered' });
    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'STUDENT', active: true },
      {
        $set: {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone || '',
          department: department || 'Computer Science',
        },
      },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});
r.delete('/students/:id', auth, roles('ADMIN'), async (req, res) => {
  const student = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'STUDENT', active: true },
    { $set: { active: false } },
    { new: true }
  );
  if (!student) return res.status(404).json({ message: 'Student not found' });
  res.json({ message: 'Student deleted' });
});
r.post('/staff', auth, roles('ADMIN'), async (req, res) => {
  try {
    const { name, password, staffDesignation } = req.body;
    const designation = STAFF_DESIGNATIONS.find((item) => item.title === staffDesignation);
    if (typeof name !== 'string' || !name.trim() || typeof password !== 'string' || !designation)
      return res.status(400).json({ message: 'Name, designation, and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.create({
      name: name.trim(),
      email: await uniqueStaffEmail(designation.title, name.trim()),
      passwordHash: await bcrypt.hash(password, 12),
      role: 'STAFF',
      staffDesignation: designation.title,
      staffDepartment: designation.department,
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      staffDesignation: user.staffDesignation,
      staffDepartment: user.staffDepartment,
    });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({
      message: error.code === 11000 ? 'Login ID already exists; please try again' : error.message,
    });
  }
});
r.put('/staff/:id', auth, roles('ADMIN'), async (req, res) => {
  try {
    const { name, password, staffDesignation } = req.body;
    const designation = STAFF_DESIGNATIONS.find((item) => item.title === staffDesignation);
    if (typeof name !== 'string' || !name.trim() || !designation)
      return res.status(400).json({ message: 'Name and designation are required' });
    if (password !== undefined && (typeof password !== 'string' || password.length < 8))
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.findOne({ _id: req.params.id, role: 'STAFF', active: true });
    if (!user) return res.status(404).json({ message: 'Staff account not found' });
    if (user.staffDesignation !== designation.title)
      user.email = await uniqueStaffEmail(designation.title, name.trim(), user._id);

    user.name = name.trim();
    user.staffDesignation = designation.title;
    user.staffDepartment = designation.department;
    if (password) user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      staffDesignation: user.staffDesignation,
      staffDepartment: user.staffDepartment,
    });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({
      message: error.code === 11000 ? 'Login ID already exists; please try again' : error.message,
    });
  }
});
r.delete('/staff/:id', auth, roles('ADMIN'), async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'STAFF', active: true },
    { $set: { active: false } },
    { new: true }
  );
  if (!user) return res.status(404).json({ message: 'Staff account not found' });
  res.json({ message: 'Staff account deactivated' });
});
export default r;
