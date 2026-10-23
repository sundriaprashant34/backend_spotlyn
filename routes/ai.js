import express from 'express';
import Complaint from '../models/Complaint.js';
import LostItem from '../models/LostItem.js';
import FoundItem from '../models/FoundItem.js';
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      message: 'Gemini API key is not configured. Add GEMINI_API_KEY in backend/.env',
    });
  }

  try {
    const context = await buildContext(req.user);
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: 'You are Spotlyn AI, an assistant for the Spotlyn campus management app. Answer using only the provided app context and the user role. Keep responses concise, helpful, and relevant to complaints, lost and found, staff tasks, and campus operations. Do not invent data. If you do not know, say you need more information.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: JSON.stringify({
                    request: message,
                    user: context.user,
                    complaints: context.complaints || [],
                    lostItems: context.lostItems || [],
                    foundItems: context.foundItems || [],
                  }),
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({ message: `Gemini request failed: ${errText}` });
    }

    const data = await response.json();
    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || 'I could not generate a response.';

    return res.json({ reply, source: 'gemini', contextUsed: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'AI request failed' });
  }
});

export default r;
