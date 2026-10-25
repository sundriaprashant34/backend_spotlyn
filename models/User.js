import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    profilePhoto: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    department: { type: String, default: 'Computer Science' },
    role: { type: String, enum: ['STUDENT', 'STAFF', 'ADMIN'], default: 'STUDENT' },
    staffDesignation: { type: String, default: '' },
    staffDepartment: { type: String, default: '' },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0, min: 0 },
    emailVerified: { type: Boolean, default: false },
    welcomeEmailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export default mongoose.model('User', schema);
