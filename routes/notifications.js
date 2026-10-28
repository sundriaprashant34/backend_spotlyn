import express from 'express';
import Notification from '../models/Notification.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();

r.get('/', auth, async (req, res) =>
  res.json(
    await Notification.find({
      user: req.user._id,
      title: { $nin: ['Handover verification code', 'New handover verification code'] },
    })
      .sort('-createdAt')
      .limit(100)
  )
);

r.put('/:id/read', auth, async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true } },
    { new: true }
  );
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json(notification);
});

export default r;
