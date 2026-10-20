import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    message: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export default mongoose.model('Notification', schema);
