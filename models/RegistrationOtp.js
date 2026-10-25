import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    department: { type: String, default: 'Computer Science' },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true },
    otpSalt: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model('RegistrationOtp', schema);
