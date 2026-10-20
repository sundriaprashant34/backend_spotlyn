import Counter from '../models/Counter.js';
export async function next(key) {
  const c = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  return c.value;
}
export async function generateComplaintId() {
  return `SP-${String(await next('COMPLAINT')).padStart(4, '0')}`;
}
