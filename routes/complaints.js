import express from 'express';
import Complaint from '../models/Complaint.js';
import ComplaintHistory from '../models/ComplaintHistory.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { auth, roles } from '../middleware/auth.js';
import { imageUpload } from '../middleware/imageUpload.js';
import { generateComplaintId } from '../utils/counters.js';
import { APPROVAL_REASONS, REJECTION_REASONS } from '../../shared/complaintReview.js';
const r = express.Router();
const hist = async (c, action, oldStatus, newStatus, by, remark = '') =>
  ComplaintHistory.create({
    complaint: c._id,
    action,
    oldStatus,
    newStatus,
    performedBy: by,
    remark,
  });
const notify = async (c, title, message) => {
  await Notification.create({ user: c.student, title, message });
};
r.post('/', auth, roles('STUDENT'), imageUpload.single('image'), async (req, res) => {
  try {
    const c = await Complaint.create({
      complaintId: await generateComplaintId(),
      student: req.user._id,
      studentName: req.user.name,
      title: req.body.title,
      category: req.body.category,
      subcategory: req.body.subcategory,
      description: req.body.description,
      building: req.body.building,
      floor: req.body.floor,
      room: req.body.room,
      priority: req.body.priority || 'Medium',
      image: req.file?.path || '',
    });
    await hist(c, 'Complaint submitted', '', c.status, req.user._id);
    res.status(201).json(c);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
r.get('/mine', auth, roles('STUDENT'), async (req, res) =>
  res.json(
    await Complaint.find({ student: req.user._id })
      .populate('assignedStaff', 'name email staffDepartment')
      .sort('-createdAt')
  )
);
r.get('/', auth, async (req, res) => {
  const filter =
    req.user.role === 'STUDENT'
      ? { student: req.user._id }
      : req.user.role === 'STAFF'
        ? { assignedStaff: req.user._id }
        : {};
  res.json(
    await Complaint.find(filter)
      .populate('student', 'name email phone department')
      .populate('assignedStaff', 'name email staffDepartment')
      .sort('-createdAt')
  );
});
r.get('/:id', auth, async (req, res) => {
  const c = await Complaint.findById(req.params.id)
    .populate('student', 'name email phone department')
    .populate('assignedStaff', 'name email staffDepartment');
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  if (req.user.role === 'STUDENT' && String(c.student._id) !== String(req.user._id))
    return res.status(403).json({ message: 'Access denied' });
  if (req.user.role === 'STAFF' && String(c.assignedStaff?._id) !== String(req.user._id))
    return res.status(403).json({ message: 'Access denied' });
  res.json({
    complaint: c,
    history: await ComplaintHistory.find({ complaint: c._id })
      .populate('performedBy', 'name role')
      .sort('createdAt'),
  });
});
r.put('/:id/verify', auth, roles('ADMIN'), async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Not found' });
  const old = c.status;
  c.status = req.body.approve === false ? 'Rejected' : 'Verified';
  c.adminRemark = req.body.remark || '';
  await c.save();
  await hist(
    c,
    c.status === 'Verified' ? 'Complaint verified' : 'Complaint rejected',
    old,
    c.status,
    req.user._id,
    c.adminRemark
  );
  await notify(c, `Complaint ${c.status}`, `${c.complaintId} is now ${c.status}.`);
  res.json(c);
});
r.put('/:id/assign', auth, roles('ADMIN'), async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  const staff = await User.findOne({ _id: req.body.staffId, role: 'STAFF', active: true });
  if (!c || !staff) return res.status(404).json({ message: 'Complaint or staff not found' });
  const old = c.status;
  c.assignedDepartment = req.body.department || staff.staffDepartment;
  c.assignedStaff = staff._id;
  c.status = 'Assigned';
  c.staffDecisionReason = '';
  c.staffDecisionDetails = '';
  await c.save();
  await hist(c, 'Complaint assigned', old, 'Assigned', req.user._id, c.assignedDepartment);
  await notify(c, 'Complaint assigned', `${c.complaintId} has been assigned to ${staff.name}.`);
  res.json(c);
});
r.put('/:id/review', auth, roles('STAFF'), async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  if (String(c.assignedStaff) !== String(req.user._id))
    return res.status(403).json({ message: 'Access denied' });
  if (c.status !== 'Assigned')
    return res.status(409).json({ message: 'Only assigned complaints can be reviewed.' });

  const { decision, reason, details } = req.body;
  const isApproval = decision === 'approve';
  const reasons = isApproval ? APPROVAL_REASONS : REJECTION_REASONS;
  if ((!isApproval && decision !== 'reject') || !reasons.includes(reason))
    return res.status(400).json({ message: 'Choose a valid decision and reason.' });
  if (reason === 'Other' && (typeof details !== 'string' || !details.trim()))
    return res.status(400).json({ message: 'Please provide details when selecting Other.' });
  if (details !== undefined && (typeof details !== 'string' || details.length > 500))
    return res.status(400).json({ message: 'Additional details must be 500 characters or fewer.' });

  const old = c.status;
  c.status = isApproval ? 'Approved' : 'Rejected';
  c.staffDecisionReason = reason;
  c.staffDecisionDetails = details?.trim() || '';
  await c.save();
  const remark = [reason, c.staffDecisionDetails].filter(Boolean).join(': ');
  await hist(
    c,
    isApproval ? 'Complaint approved by staff' : 'Complaint rejected by staff',
    old,
    c.status,
    req.user._id,
    remark
  );
  await notify(
    c,
    `Complaint ${c.status}`,
    `${c.complaintId} was ${c.status.toLowerCase()} by staff: ${remark}`
  );
  res.json(c);
});
r.put('/:id/status', auth, async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Not found' });
  if (req.user.role === 'STAFF' && String(c.assignedStaff) !== String(req.user._id))
    return res.status(403).json({ message: 'Access denied' });
  if (!['ADMIN', 'STAFF'].includes(req.user.role))
    return res.status(403).json({ message: 'Access denied' });
  const allowed = ['Assigned', 'In Progress', 'Resolved'];
  if (!allowed.includes(req.body.status))
    return res.status(400).json({ message: 'Invalid status' });
  if (
    req.user.role === 'STAFF' &&
    !(
      (req.body.status === 'In Progress' && ['Assigned', 'Approved'].includes(c.status)) ||
      (req.body.status === 'Resolved' && c.status === 'In Progress')
    )
  )
    return res.status(409).json({ message: 'This status change is not allowed.' });
  const old = c.status;
  c.status = req.body.status;
  c.resolutionRemark = req.body.resolutionRemark || c.resolutionRemark;
  await c.save();
  await hist(c, `Status changed to ${c.status}`, old, c.status, req.user._id, c.resolutionRemark);
  await notify(
    c,
    `Complaint ${c.status}`,
    `Your complaint ${c.complaintId} is now ${c.status}. ${c.resolutionRemark || ''}`
  );
  res.json(c);
});
export default r;
