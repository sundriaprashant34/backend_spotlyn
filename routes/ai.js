import express from 'express';
import Complaint from '../models/Complaint.js';
import LostItem from '../models/LostItem.js';
import FoundItem from '../models/FoundItem.js';
import User from '../models/User.js';
import { auth, roles } from '../middleware/auth.js';

const r = express.Router();

const formatComplaint = (c) => ({
  complaintId: c.complaintId,
  title: c.title,
  category: c.category,
  status: c.status,
  priority: c.priority,
  building: c.building,
  room: c.room,
  assignedDepartment: c.assignedDepartment || 'Unassigned',
  studentName: c.studentName || 'Unknown',
  createdAt: c.createdAt,
});

async function buildContext(reqUser) {
  const base = {
    user: {
      name: reqUser.name,
      email: reqUser.email,
      role: reqUser.role,
      department: reqUser.department,
      staffDepartment: reqUser.staffDepartment || null,
    },
  };

  if (reqUser.role === 'STUDENT') {
    const complaints = await Complaint.find({ student: reqUser._id }).sort({ createdAt: -1 }).limit(10);
    const lostItems = await LostItem.find({ reporter: reqUser._id }).sort({ createdAt: -1 }).limit(5);
    const foundItems = await FoundItem.find({ reporter: reqUser._id }).sort({ createdAt: -1 }).limit(5);

    return {
      ...base,
      complaints: complaints.map(formatComplaint),
      lostItems: lostItems.map((item) => ({
        title: item.itemName,
        status: item.status,
        category: item.category,
        createdAt: item.createdAt,
      })),
      foundItems: foundItems.map((item) => ({
        title: item.itemName,
        status: item.status,
        category: item.category,
        createdAt: item.createdAt,
      })),
    };
  }

  const complaints = await Complaint.find({
    ...(reqUser.role === 'STAFF' ? { assignedStaff: reqUser._id } : {}),
  })
    .populate('student', 'name email department')
    .sort({ createdAt: -1 })
    .limit(25);

  const userCounts =
    reqUser.role === 'ADMIN'
      ? {
          total: await User.countDocuments(),
          students: await User.countDocuments({ role: 'STUDENT' }),
          staff: await User.countDocuments({ role: 'STAFF' }),
          admins: await User.countDocuments({ role: 'ADMIN' }),
          active: await User.countDocuments({ active: true }),
        }
      : undefined;

  return {
    ...base,
    ...(userCounts ? { userCounts } : {}),
    complaints: complaints.map((c) => ({
      complaintId: c.complaintId,
      title: c.title,
      category: c.category,
      status: c.status,
      priority: c.priority,
      building: c.building,
      room: c.room,
      studentName: c.student?.name || c.studentName,
      department: c.student?.department || 'Unknown',
      assignedDepartment: c.assignedDepartment || 'Unassigned',
      createdAt: c.createdAt,
    })),
  };
}

r.post('/chat', auth, roles('STUDENT', 'STAFF', 'ADMIN'), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Message is required' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return res.status(503).json({
      message: 'Groq API key is not configured. Add GROQ_API_KEY in backend/.env',
    });
  }

  try {
    const context = await buildContext(req.user);
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are Spotlyn AI, an assistant for the Spotlyn campus management app. Answer using only the provided app context and the user role. For admin questions about user counts, use the exact values in userCounts; total includes every account, while students, staff, and admins are the role breakdown. Keep responses concise and helpful. Do not invent data. If a requested value is not in the context, say you do not have that information.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: message,
              user: context.user,
              userCounts: context.userCounts || null,
              complaints: context.complaints || [],
              lostItems: context.lostItems || [],
              foundItems: context.foundItems || [],
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return res.status(503).json({
          message: 'Groq is busy or the API rate limit was reached. Please wait briefly and try again.',
        });
      }
      if (response.status === 503) {
        return res.status(503).json({
          message: 'Groq is temporarily busy. Please wait a moment and try again.',
        });
      }
      return res.status(502).json({ message: `Groq request failed: ${errText}` });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ message: 'Groq returned an empty response. Please try again.' });
    }

    return res.json({ reply, source: 'groq', contextUsed: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'AI request failed' });
  }
});

export default r;
