import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    action: String,
    oldStatus: String,
    newStatus: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remark: String,
  },
  { timestamps: true }
);
export default mongoose.model('ComplaintHistory', schema);
