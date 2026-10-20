import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, unique: true },
  active: { type: Boolean, default: true },
});
export default mongoose.model('Department', schema);
