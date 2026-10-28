import express from 'express';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import LostItem from '../models/LostItem.js';
import FoundItem from '../models/FoundItem.js';
import LostFoundClaim from '../models/LostFoundClaim.js';
import Notification from '../models/Notification.js';
import { auth, roles } from '../middleware/auth.js';
import { imageUpload } from '../middleware/imageUpload.js';

const r = express.Router();
const modelFor = (type) => (type === 'lost' ? LostItem : type === 'found' ? FoundItem : null);
const modelNameFor = (type) => (type === 'lost' ? 'LostItem' : 'FoundItem');
const createHandoverCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
const hashHandoverCode = (code) =>
  createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');

const sendNotification = (user, title, message) => Notification.create({ user, title, message });

const populatedClaimQuery = (query) =>
  query.populate('claimant', 'name phone sharePhoneForHandover').populate({
    path: 'item',
    populate: { path: 'reporter', select: 'name phone sharePhoneForHandover' },
  });

const serializeClaim = (claim, user, admin = false) => {
  const item = claim.item;
  const owner = claim.itemType === 'found' ? claim.claimant : item.reporter;
  const finder = claim.itemType === 'found' ? item.reporter : claim.claimant;
  const counterpart = String(owner._id) === String(user._id) ? finder : owner;
  const canShareContact = claim.status === 'Approved' || claim.status === 'Returned';
  return {
    _id: claim._id,
    itemType: claim.itemType,
    details: admin || String(claim.claimant._id) === String(user._id) ? claim.details : undefined,
    status: claim.status,
    ownerConfirmed: claim.ownerConfirmed,
    finderConfirmed: claim.finderConfirmed,
    reviewedAt: claim.reviewedAt,
    returnedAt: claim.returnedAt,
    createdAt: claim.createdAt,
    isOwner: String(owner._id) === String(user._id),
    isFinder: String(finder._id) === String(user._id),
    item: {
      _id: item._id,
      itemName: item.itemName,
      category: item.category,
      location: item.location,
      date: item.date,
      status: item.status,
      image: item.image,
    },
    claimant: admin ? claim.claimant : undefined,
    reporter: admin ? item.reporter : undefined,
    counterpart: {
      name: canShareContact ? counterpart.name : 'Hidden until admin approval',
      phone: canShareContact && counterpart.sharePhoneForHandover ? counterpart.phone || '' : '',
      phoneShared: Boolean(
        canShareContact && counterpart.sharePhoneForHandover && counterpart.phone
      ),
    },
  };
};

const createReport = async (model, req, res) => {
  const { itemName, category, description, location, date } = req.body;
  const report = await model.create({
    reporter: req.user._id,
    reviewStatus: 'Pending',
    itemName,
    category,
    description,
    location,
    date,
    image: req.file?.path || '',
  });
  res.status(201).json(report);
};

r.post('/lost', auth, roles('STUDENT'), imageUpload.single('image'), async (req, res) =>
  createReport(LostItem, req, res)
);

r.post('/found', auth, roles('STUDENT'), imageUpload.single('image'), async (req, res) =>
  createReport(FoundItem, req, res)
);

for (const type of ['lost', 'found']) {
  r.get(`/${type}`, auth, async (req, res) => {
    const model = modelFor(type);
    const query =
      req.user.role === 'ADMIN'
        ? model.find()
        : model.find({
            $or: [
              { reviewStatus: 'Approved' },
              { reviewStatus: { $exists: false } },
              { reporter: req.user._id },
            ],
          });
    const reports = await query.sort('-createdAt');
    if (req.user.role === 'ADMIN')
      await model.populate(reports, { path: 'reporter', select: 'name email phone' });
    res.json(
      reports.map((report) => {
        const data = report.toObject();
        if (req.user.role !== 'STUDENT') return data;
        const isMine = String(report.reporter) === String(req.user._id);
        delete data.reporter;
        return { ...data, isMine };
      })
    );
  });
}

r.put('/:type/:id/review', auth, roles('ADMIN'), async (req, res) => {
  const model = modelFor(req.params.type);
  if (!model) return res.status(400).json({ message: 'Invalid item type' });
  const { decision } = req.body;
  if (!['approve', 'reject'].includes(decision))
    return res.status(400).json({ message: 'Choose approve or reject.' });
  const item = await model.findOneAndUpdate(
    { _id: req.params.id, reviewStatus: 'Pending' },
    {
      $set: {
        reviewStatus: decision === 'approve' ? 'Approved' : 'Rejected',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  );
  if (!item) {
    if (!(await model.exists({ _id: req.params.id })))
      return res.status(404).json({ message: 'Item report not found' });
    return res.status(409).json({ message: 'Only pending reports can be reviewed.' });
  }
  await sendNotification(
    item.reporter,
    `Lost & Found report ${item.reviewStatus.toLowerCase()}`,
    `Your ${req.params.type} item report for "${item.itemName}" was ${item.reviewStatus.toLowerCase()} by an administrator.`
  );
  await model.populate(item, { path: 'reporter', select: 'name email phone' });
  res.json(item);
});

r.put('/:type/:id/status', auth, roles('ADMIN'), async (req, res) => {
  const model = modelFor(req.params.type);
  if (!model) return res.status(400).json({ message: 'Invalid item type' });
  const { status } = req.body;
  if (!['Open', 'Matched', 'Resolved'].includes(status))
    return res.status(400).json({ message: 'Invalid item status' });
  const item = await model
    .findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true })
    .populate('reporter', 'name email phone');
  if (!item) return res.status(404).json({ message: 'Item report not found' });
  res.json(item);
});

r.post('/:type/:id/claims', auth, roles('STUDENT'), async (req, res) => {
  const model = modelFor(req.params.type);
  if (!model) return res.status(400).json({ message: 'Invalid item type' });
  const details = typeof req.body.details === 'string' ? req.body.details.trim() : '';
  if (!details || details.length > 1000)
    return res.status(400).json({ message: 'Add identifying details (up to 1000 characters).' });
  const item = await model.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item report not found' });
  if (item.reviewStatus && item.reviewStatus !== 'Approved')
    return res.status(409).json({ message: 'Only approved reports can receive a claim.' });
  if (String(item.reporter) === String(req.user._id))
    return res.status(400).json({ message: 'You cannot submit a claim on your own report.' });
  if (item.status === 'Resolved')
    return res.status(409).json({ message: 'This item has already been resolved.' });
  const duplicate = await LostFoundClaim.exists({
    item: item._id,
    claimant: req.user._id,
    status: { $in: ['Pending', 'Approved', 'Returned'] },
  });
  if (duplicate)
    return res.status(409).json({ message: 'You already have an active claim for this item.' });

  const claim = await LostFoundClaim.create({
    itemType: req.params.type,
    item: item._id,
    itemModel: modelNameFor(req.params.type),
    claimant: req.user._id,
    details,
  });
  await sendNotification(
    item.reporter,
    'New Lost & Found claim',
    `A student submitted an ownership/finder claim for "${item.itemName}". An administrator will review it.`
  );
  await sendNotification(
    req.user._id,
    'Claim submitted',
    `Your claim for "${item.itemName}" was sent for administrator review.`
  );
  res.status(201).json(claim);
});

r.get('/claims/mine', auth, roles('STUDENT'), async (req, res) => {
  const claims = await populatedClaimQuery(
    LostFoundClaim.find({
      $or: [
        { claimant: req.user._id },
        {
          itemType: 'lost',
          itemModel: 'LostItem',
          item: { $in: await LostItem.find({ reporter: req.user._id }).distinct('_id') },
        },
        {
          itemType: 'found',
          itemModel: 'FoundItem',
          item: { $in: await FoundItem.find({ reporter: req.user._id }).distinct('_id') },
        },
      ],
    }).sort('-createdAt')
  );
  res.json(claims.map((claim) => serializeClaim(claim, req.user)));
});

r.get('/claims', auth, roles('ADMIN'), async (_req, res) => {
  const claims = await populatedClaimQuery(LostFoundClaim.find().sort('-createdAt'));
  res.json(claims.map((claim) => serializeClaim(claim, { _id: 'admin' }, true)));
});

r.put('/claims/:id/review', auth, roles('ADMIN'), async (req, res) => {
  const { decision } = req.body;
  if (!['approve', 'reject'].includes(decision))
    return res.status(400).json({ message: 'Choose approve or reject.' });
  const claim = await populatedClaimQuery(LostFoundClaim.findById(req.params.id));
  if (!claim) return res.status(404).json({ message: 'Claim not found.' });
  if (claim.status !== 'Pending')
    return res.status(409).json({ message: 'Only pending claims can be reviewed.' });
  if (decision === 'approve') {
    const competingClaim = await LostFoundClaim.exists({
      item: claim.item._id,
      _id: { $ne: claim._id },
      status: 'Approved',
    });
    if (competingClaim)
      return res.status(409).json({ message: 'Another claim for this item is already approved.' });
  }
  let reviewedClaim;
  try {
    reviewedClaim = await LostFoundClaim.findOneAndUpdate(
      { _id: claim._id, status: 'Pending' },
      {
        $set: {
          status: decision === 'approve' ? 'Approved' : 'Rejected',
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ message: 'Another claim for this item is already approved.' });
    throw error;
  }
  if (!reviewedClaim)
    return res.status(409).json({ message: 'This claim has already been reviewed.' });
  if (decision === 'approve')
    await modelFor(claim.itemType).findByIdAndUpdate(claim.item._id, { status: 'Matched' });
  const owner = claim.itemType === 'found' ? claim.claimant : claim.item.reporter;
  const finder = claim.itemType === 'found' ? claim.item.reporter : claim.claimant;
  let handoverCode = '';
  if (decision === 'approve') {
    handoverCode = createHandoverCode();
    await LostFoundClaim.findByIdAndUpdate(claim._id, {
      $set: {
        handoverOtpHash: hashHandoverCode(handoverCode),
        handoverOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        handoverOtpSentAt: new Date(),
        handoverOtpAttempts: 0,
      },
    });
  }
  const message =
    decision === 'approve'
      ? `The claim for "${claim.item.itemName}" was approved. You can now coordinate the handover in Lost & Found.`
      : `The claim for "${claim.item.itemName}" was not approved.`;
  await Promise.all([
    sendNotification(
      owner._id,
      `Claim ${decision === 'approve' ? 'approved' : 'rejected'}`,
      message
    ),
    sendNotification(
      finder._id,
      `Claim ${decision === 'approve' ? 'approved' : 'rejected'}`,
      message
    ),
    ...(handoverCode
      ? [
          sendNotification(
            owner._id,
            'Handover verification code',
            `Your one-time code for "${claim.item.itemName}" is ${handoverCode}. Share it with the finder only when you receive the item. It expires in 15 minutes.`
          ),
        ]
      : []),
  ]);
  const updatedClaim = await populatedClaimQuery(LostFoundClaim.findById(reviewedClaim._id));
  res.json(serializeClaim(updatedClaim, { _id: 'admin' }, true));
});

r.post('/claims/:id/handover-code', auth, roles('STUDENT'), async (req, res) => {
  const claim = await populatedClaimQuery(LostFoundClaim.findById(req.params.id));
  if (!claim) return res.status(404).json({ message: 'Claim not found.' });
  if (claim.status !== 'Approved' || claim.finderConfirmed)
    return res.status(409).json({ message: 'A new code is not available for this handover.' });
  const owner = claim.itemType === 'found' ? claim.claimant : claim.item.reporter;
  if (String(owner._id) !== String(req.user._id))
    return res.status(403).json({ message: 'Only the item owner can request a new code.' });
  if (claim.handoverOtpSentAt && Date.now() - claim.handoverOtpSentAt.getTime() < 60 * 1000)
    return res
      .status(429)
      .json({ message: 'Please wait a minute before requesting another code.' });
  const code = createHandoverCode();
  await LostFoundClaim.findByIdAndUpdate(claim._id, {
    $set: {
      handoverOtpHash: hashHandoverCode(code),
      handoverOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      handoverOtpSentAt: new Date(),
      handoverOtpAttempts: 0,
    },
  });
  await sendNotification(
    owner._id,
    'New handover verification code',
    `Your new one-time code for "${claim.item.itemName}" is ${code}. Share it with the finder only when you receive the item. It expires in 15 minutes.`
  );
  res.json({ message: 'A new handover code was sent to your notifications.' });
});

r.post('/claims/:id/confirm-handover', auth, roles('STUDENT'), async (req, res) => {
  const currentClaim = await populatedClaimQuery(LostFoundClaim.findById(req.params.id));
  if (!currentClaim) return res.status(404).json({ message: 'Claim not found.' });
  if (!['Approved', 'Returned'].includes(currentClaim.status))
    return res.status(409).json({ message: 'Only approved claims can confirm a handover.' });
  const owner =
    currentClaim.itemType === 'found' ? currentClaim.claimant : currentClaim.item.reporter;
  const finder =
    currentClaim.itemType === 'found' ? currentClaim.item.reporter : currentClaim.claimant;
  const isOwner = String(owner._id) === String(req.user._id);
  const isFinder = String(finder._id) === String(req.user._id);
  if (!isOwner && !isFinder)
    return res.status(403).json({ message: 'Only the owner or finder can confirm this handover.' });
  if (currentClaim.status === 'Returned') return res.json(serializeClaim(currentClaim, req.user));
  let finderCodeVerified = false;
  if (isFinder && !currentClaim.finderConfirmed) {
    const providedCode = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    const storedHash = currentClaim.handoverOtpHash;
    const expiresAt = currentClaim.handoverOtpExpiresAt?.getTime();
    const providedHash = /^\d{6}$/.test(providedCode) ? hashHandoverCode(providedCode) : '';
    const matches =
      storedHash &&
      providedHash &&
      expiresAt > Date.now() &&
      timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(providedHash, 'hex'));
    if (!matches) {
      const attempts = currentClaim.handoverOtpAttempts + 1;
      if (attempts >= 5) {
        await LostFoundClaim.findByIdAndUpdate(currentClaim._id, {
          $set: {
            handoverOtpHash: '',
            handoverOtpExpiresAt: null,
            handoverOtpAttempts: 0,
          },
        });
      } else {
        await LostFoundClaim.findByIdAndUpdate(currentClaim._id, {
          $inc: { handoverOtpAttempts: 1 },
        });
      }
      return res.status(400).json({
        message:
          expiresAt <= Date.now()
            ? 'The handover code expired. Ask the owner to send a new one.'
            : 'The handover code is incorrect or expired.',
      });
    }
    finderCodeVerified = true;
  }
  const claim = await LostFoundClaim.findByIdAndUpdate(
    currentClaim._id,
    {
      $set: {
        [isOwner ? 'ownerConfirmed' : 'finderConfirmed']: true,
        ...(finderCodeVerified
          ? {
              handoverOtpHash: '',
              handoverOtpExpiresAt: null,
              handoverOtpAttempts: 0,
            }
          : {}),
      },
    },
    { new: true }
  );
  let completedClaim = null;
  if (claim.ownerConfirmed && claim.finderConfirmed) {
    completedClaim = await LostFoundClaim.findOneAndUpdate(
      { _id: claim._id, status: 'Approved', ownerConfirmed: true, finderConfirmed: true },
      { $set: { status: 'Returned', returnedAt: new Date() } },
      { new: true }
    );
    if (completedClaim)
      await modelFor(currentClaim.itemType).findByIdAndUpdate(currentClaim.item._id, {
        status: 'Resolved',
      });
  }
  const updatedClaim = await populatedClaimQuery(LostFoundClaim.findById(currentClaim._id));
  if (completedClaim) {
    const message = `Both students confirmed the handover of "${updatedClaim.item.itemName}". It is marked returned.`;
    await Promise.all([
      sendNotification(owner._id, 'Item returned', message),
      sendNotification(finder._id, 'Item returned', message),
    ]);
  } else {
    const otherParty = isOwner ? finder : owner;
    await sendNotification(
      otherParty._id,
      'Handover update',
      `${isOwner ? 'The owner' : 'The finder'} confirmed the handover for "${updatedClaim.item.itemName}". Waiting for the other confirmation.`
    );
  }
  res.json(serializeClaim(updatedClaim, req.user));
});

export default r;
