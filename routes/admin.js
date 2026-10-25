import express from 'express';
import Complaint from '../models/Complaint.js';
import User from '../models/User.js';
import LostItem from '../models/LostItem.js';
import FoundItem from '../models/FoundItem.js';
import { auth, roles } from '../middleware/auth.js';
const r = express.Router();
r.get('/stats', auth, roles('ADMIN'), async (_q, res) => {
  const [a, b, c, d, e, f, g, h] = await Promise.all([
    Complaint.countDocuments(),
    Complaint.countDocuments({ status: { $in: ['Submitted', 'Verified', 'Assigned', 'Approved'] } }),
    Complaint.countDocuments({ status: 'In Progress' }),
    Complaint.countDocuments({ status: 'Resolved' }),
    User.countDocuments({ role: 'STUDENT' }),
    LostItem.countDocuments({ status: 'Open' }),
    FoundItem.countDocuments({ status: 'Open' }),
    Complaint.countDocuments({ priority: 'Emergency', status: { $ne: 'Resolved' } }),
  ]);
  res.json({
    totalComplaints: a,
    pending: b,
    inProgress: c,
    resolved: d,
    students: e,
    lost: f,
    found: g,
    emergency: h,
  });
});
export default r;
