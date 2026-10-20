import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const p = jwt.verify(token, process.env.JWT_SECRET);
    const u = await User.findById(p.id).select('-passwordHash');
    if (!u || !u.active) return res.status(401).json({ message: 'Account unavailable' });
    req.user = u;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
export function roles(...allowed) {
  return (req, res, next) =>
    allowed.includes(req.user.role) ? next() : res.status(403).json({ message: 'Access denied' });
}
