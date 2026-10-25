import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    complaintId: { type: String, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, trim: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: String,
    description: { type: String, required: true },
    building: { type: String, required: true },
    floor: { type: String, required: true },
    room: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Emergency'], default: 'Medium' },
    status: {
      type: String,
      enum: [
        'Submitted',
        'Verified',
        'Assigned',
        'Approved',
        'In Progress',
        'Resolved',
        'Rejected',
      ],
      default: 'Submitted',
    },
    image: String,
    assignedDepartment: String,
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminRemark: String,
    staffDecisionReason: String,
    staffDecisionDetails: String,
    resolutionRemark: String,
    resolutionImage: String,
  },
  { timestamps: true }
);
export default mongoose.model('Complaint', schema);
