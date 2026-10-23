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
    const lostItems = await LostItem.find({ student: reqUser._id }).sort({ createdAt: -1 }).limit(5);
    const foundItems = await FoundItem.find({ finder: reqUser._id }).sort({ createdAt: -1 }).limit(5);

    return {
      ...base,
      complaints: complaints.map(formatComplaint),
      lostItems: lostItems.map((item) => ({
        title: item.title,
        status: item.status,
        category: item.category,
        createdAt: item.createdAt,
      })),
      foundItems: foundItems.map((item) => ({
        title: item.title,
        status: item.status,
        category: item.category,
        createdAt: item.createdAt,
      })),
    };
  }

  const complaints = await Complaint.find({
    ...(reqUser.role === 'STAFF'
      ? {
          $or: [
            { assignedStaff: reqUser._id },
            { assignedDepartment: reqUser.staffDepartment },
            { assignedStaff: null, assignedDepartment: reqUser.staffDepartment },
          ],
        }
      : {}),
  })
    .populate('student', 'name email department')
    .sort({ createdAt: -1 })
    .limit(25);

  return {
    ...base,
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

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      message: 'Mistral API key is not configured. Add MISTRAL_API_KEY in backend/.env',
    });
  }

  try {
    const context = await buildContext(req.user);
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are Spotlyn AI, an assistant for the Spotlyn campus management app. Answer using only the provided app context and the user role. Keep responses concise, helpful, and relevant to complaints, lost and found, staff tasks, and campus operations. Do not invent data. If you do not know, say you need more information.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: message,
              user: context.user,
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
      return res.status(502).json({ message: `Mistral request failed: ${errText}` });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || 'I could not generate a response.';

    return res.json({ reply, source: 'mistral', contextUsed: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'AI request failed' });
  }
});

export default r;
