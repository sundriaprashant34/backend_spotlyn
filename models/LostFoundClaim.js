import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    itemType: { type: String, enum: ['lost', 'found'], required: true },
    item: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'itemModel' },
    itemModel: { type: String, enum: ['LostItem', 'FoundItem'], required: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    details: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Returned'],
      default: 'Pending',
    },
    ownerConfirmed: { type: Boolean, default: false },
    finderConfirmed: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
schema.index({ item: 1, claimant: 1, status: 1 });
schema.index({ item: 1 }, { unique: true, partialFilterExpression: { status: 'Approved' } });
export default mongoose.model('LostFoundClaim', schema);
