import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    itemName: { type: String, required: true },
    category: { type: String, required: true },
    description: String,
    location: String,
    date: Date,
    image: String,
    status: { type: String, enum: ['Open', 'Matched', 'Resolved'], default: 'Open' },
    reviewStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'] },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
export default mongoose.model('LostItem', schema);
