import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: Number, default: 0 },
});
export default mongoose.model('Counter', schema);
