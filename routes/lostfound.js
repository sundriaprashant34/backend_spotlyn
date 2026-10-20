import express from 'express';
import LostItem from '../models/LostItem.js';
import FoundItem from '../models/FoundItem.js';
import { auth, roles } from '../middleware/auth.js';
import { imageUpload } from '../middleware/imageUpload.js';
const r = express.Router();
r.post('/lost', auth, imageUpload.single('image'), async (req, res) =>
  res.status(201).json(
    await LostItem.create({
      reporter: req.user._id,
      ...req.body,
      image: req.file?.path || '',
    })
  )
);
r.post('/found', auth, imageUpload.single('image'), async (req, res) =>
  res.status(201).json(
    await FoundItem.create({
      reporter: req.user._id,
      ...req.body,
      image: req.file?.path || '',
    })
  )
);
r.get('/lost', auth, async (_q, res) =>
  res.json(await LostItem.find().populate('reporter', 'name email').sort('-createdAt'))
);
r.get('/found', auth, async (_q, res) =>
  res.json(await FoundItem.find().populate('reporter', 'name email').sort('-createdAt'))
);
r.put('/:type/:id/status', auth, roles('ADMIN'), async (req, res) => {
  const model =
    req.params.type === 'lost' ? LostItem : req.params.type === 'found' ? FoundItem : null;
  if (!model) return res.status(400).json({ message: 'Invalid item type' });
  const { status } = req.body;
  if (!['Open', 'Matched', 'Resolved'].includes(status))
    return res.status(400).json({ message: 'Invalid item status' });
  const item = await model
    .findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true })
    .populate('reporter', 'name email');
  if (!item) return res.status(404).json({ message: 'Item report not found' });
  res.json(item);
});
export default r;
