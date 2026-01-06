const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowed = [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:5174'].filter(Boolean);
    if (allowed.includes(origin)) return callback(null, true);

    if ((process.env.NODE_ENV || 'development') === 'development') return callback(null, true);

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.options('*', cors());
// Allow larger JSON payloads (base64 images): set safe limit to 10 MB
app.use(express.json({ limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
  try {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  } catch (e) {
    // ignore
  }
  next();
});

// Simple server-side persistence for users (local JSON file)
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const USERS_FILE = path.join(__dirname, 'users.json');

// Ensure users.json exists
try {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf8');
    console.log('Initialized empty users.json');
  }
} catch (e) {
  console.error('Failed to ensure users.json exists', e);
}

async function readUsers() {
  try {
    const txt = await fsp.readFile(USERS_FILE, 'utf8');
    if (!txt.trim()) return [];
    const data = JSON.parse(txt);
    if (!Array.isArray(data)) {
      console.error('users.json is not an array – resetting to empty');
      await writeUsers([]);
      return [];
    }
    return data;
  } catch (e) {
    console.error('Failed to parse users.json:', e && e.message ? e.message : e);
    // Backup corrupted file and reset to empty users array to avoid crashes
    try {
      const bak = USERS_FILE + `.bak.${Date.now()}`;
      await fsp.rename(USERS_FILE, bak);
      console.warn(`Backed up corrupted users.json to ${bak}`);
    } catch (bakErr) {
      console.error('Failed to backup corrupted users.json:', bakErr && bakErr.message ? bakErr.message : bakErr);
    }
    // Write a fresh empty array so server can continue
    try {
      await writeUsers([]);
      console.warn('Recreated users.json as empty array');
    } catch (writeErr) {
      console.error('Failed to recreate users.json:', writeErr && writeErr.message ? writeErr.message : writeErr);
    }
    return [];
  }
}

async function writeUsers(users) {
  try {
    if (!Array.isArray(users)) {
      console.error('writeUsers called with non-array value:', users && typeof users === 'object' ? JSON.stringify(users).slice(0,1000) : String(users));
      return false;
    }
    const jsonString = JSON.stringify(users, null, 2);
    const tmpPath = USERS_FILE + '.tmp';
    // write to temp file first
    await fsp.writeFile(tmpPath, jsonString, 'utf8');
    // fs.rename is atomic on most platforms
    await fsp.rename(tmpPath, USERS_FILE);
    return true;
  } catch (e) {
    console.error('Failed to write users file atomically', e && e.message ? e.message : e);
    // attempt best-effort cleanup of tmp file
    try { if (await fsp.stat(USERS_FILE + '.tmp')) await fsp.unlink(USERS_FILE + '.tmp'); } catch(_){}
    return false;
  }
}

// GET all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await readUsers();
    return res.json(users);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read users' });
  }
});

// POST follow: body { followerId }
app.post('/api/users/:id/follow', async (req, res) => {
  try {
    const targetId = req.params.id;
    const { followerId } = req.body || {};
    if (!targetId || !followerId) return res.status(400).json({ error: 'target id and followerId required' });
    const users = await readUsers();
    // Ensure target user exists; create placeholder if missing
    let tIdx = users.findIndex(u => u.id === targetId);
    if (tIdx === -1) {
      users.push({ id: targetId, name: targetId, email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      tIdx = users.length - 1;
    }
    // Ensure follower user exists; create placeholder if missing
    let fIdx = users.findIndex(u => u.id === followerId);
    if (fIdx === -1) {
      users.push({ id: followerId, name: followerId, email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      fIdx = users.length - 1;
    }
    users[tIdx].followers = Array.isArray(users[tIdx].followers) ? users[tIdx].followers : [];
    users[fIdx].following = Array.isArray(users[fIdx].following) ? users[fIdx].following : [];
    if (!users[tIdx].followers.includes(followerId)) users[tIdx].followers.push(followerId);
    if (!users[fIdx].following.includes(targetId)) users[fIdx].following.push(targetId);
    const ok = await writeUsers(users);
    try { console.log(`User ${followerId} now follows ${targetId}. followers=${users[tIdx].followers.length}, following=${users[fIdx].following.length}`); } catch(e){}
    if (!ok) {
      console.error('Failed to persist follow change to users.json');
      return res.status(500).json({ error: 'Failed to persist follow' });
    }
    return res.json({ ok: true, users });
  } catch (e) {
    console.error('POST /api/users/:id/follow error', e);
    return res.status(500).json({ error: 'Failed to follow user' });
  }
});

// POST unfollow: body { followerId }
app.post('/api/users/:id/unfollow', async (req, res) => {
  try {
    const targetId = req.params.id;
    const { followerId } = req.body || {};
    if (!targetId || !followerId) return res.status(400).json({ error: 'target id and followerId required' });
    const users = await readUsers();
    // If users not found, create placeholders to keep state consistent
    let tIdx = users.findIndex(u => u.id === targetId);
    if (tIdx === -1) {
      users.push({ id: targetId, name: targetId, email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      tIdx = users.length - 1;
    }
    let fIdx = users.findIndex(u => u.id === followerId);
    if (fIdx === -1) {
      users.push({ id: followerId, name: followerId, email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      fIdx = users.length - 1;
    }
    users[tIdx].followers = (users[tIdx].followers || []).filter(id => id !== followerId);
    users[fIdx].following = (users[fIdx].following || []).filter(id => id !== targetId);
    const ok = await writeUsers(users);
    try { console.log(`User ${followerId} unfollowed ${targetId}. followers=${users[tIdx].followers.length}, following=${users[fIdx].following.length}`); } catch(e){}
    if (!ok) {
      console.error('Failed to persist unfollow change to users.json');
      return res.status(500).json({ error: 'Failed to persist unfollow' });
    }
    return res.json({ ok: true, users });
  } catch (e) {
    console.error('POST /api/users/:id/unfollow error', e);
    return res.status(500).json({ error: 'Failed to unfollow user' });
  }
});

// Notifications per-user: POST /api/users/:id/notifications { title, body, type }
app.post('/api/users/:id/notifications', async (req, res) => {
  try {
    const uid = req.params.id;
    const payload = req.body || {};
    if (!uid || !payload.title) return res.status(400).json({ error: 'user id and title required' });
    const users = await readUsers();
    let idx = users.findIndex(u => u.id === uid);
    if (idx === -1) {
      // create placeholder user so notifications are persisted
      users.push({ id: uid, name: uid, email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      idx = users.length - 1;
    }
    users[idx].notifications = Array.isArray(users[idx].notifications) ? users[idx].notifications : [];
    const note = { id: `srv_notif_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, title: payload.title, body: payload.body || '', ts: new Date().toISOString(), read: false, type: payload.type || 'info' };
    users[idx].notifications.unshift(note);
    const ok = await writeUsers(users);
    if (!ok) {
      console.error('Failed to persist notification to users.json');
      return res.status(500).json({ error: 'Failed to persist notification' });
    }
    return res.json({ ok: true, note, notifications: users[idx].notifications });
  } catch (e) {
    console.error('POST /api/users/:id/notifications error', e);
    return res.status(500).json({ error: 'Failed to persist notification' });
  }
});

// GET /api/users/:id/notifications
app.get('/api/users/:id/notifications', async (req, res) => {
  try {
    const uid = req.params.id;
    if (!uid) return res.status(400).json({ error: 'user id required' });
    const users = await readUsers();
    const u = users.find(x => x.id === uid);
    if (!u) return res.json([]);
    return res.json(u.notifications || []);
  } catch (e) {
    console.error('GET /api/users/:id/notifications error', e);
    return res.status(500).json({ error: 'Failed to read notifications' });
  }
});

// POST /api/users/:id/notifications/mark-read { id?: string, all?: boolean }
app.post('/api/users/:id/notifications/mark-read', async (req, res) => {
  try {
    const uid = req.params.id;
    const { id, all } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'user id required' });
    const users = await readUsers();
    const idx = users.findIndex(u => u.id === uid);
    if (idx === -1) return res.status(404).json({ error: 'user not found' });
    users[idx].notifications = Array.isArray(users[idx].notifications) ? users[idx].notifications : [];
    if (all) {
      users[idx].notifications = users[idx].notifications.map(n => ({ ...n, read: true }));
    } else if (id) {
      users[idx].notifications = users[idx].notifications.map(n => n.id === id ? ({ ...n, read: true }) : n);
    }
    await writeUsers(users);
    return res.json({ ok: true, notifications: users[idx].notifications });
  } catch (e) {
    console.error('POST /api/users/:id/notifications/mark-read error', e);
    return res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// DELETE /api/users/:id/notifications/:nid -> delete a single notification
app.delete('/api/users/:id/notifications/:nid', async (req, res) => {
  try {
    const uid = req.params.id;
    const nid = req.params.nid;
    if (!uid || !nid) return res.status(400).json({ error: 'user id and notification id required' });
    const users = await readUsers();
    const idx = users.findIndex(u => u.id === uid);
    if (idx === -1) return res.status(404).json({ error: 'user not found' });
    users[idx].notifications = (users[idx].notifications || []).filter(n => n.id !== nid);
    await writeUsers(users);
    return res.json({ ok: true, notifications: users[idx].notifications });
  } catch (e) {
    console.error('DELETE /api/users/:id/notifications/:nid error', e);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// DELETE /api/users/:id/notifications -> clear all notifications for user
app.delete('/api/users/:id/notifications', async (req, res) => {
  try {
    const uid = req.params.id;
    if (!uid) return res.status(400).json({ error: 'user id required' });
    const users = await readUsers();
    const idx = users.findIndex(u => u.id === uid);
    if (idx === -1) return res.status(404).json({ error: 'user not found' });
    users[idx].notifications = [];
    await writeUsers(users);
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/users/:id/notifications error', e);
    return res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// POST upsert user (id or email)
app.post('/api/users', async (req, res) => {
  try {
    const u = req.body || {};
    if (!u || (!u.id && !u.email)) return res.status(400).json({ error: 'User id or email required' });
    const users = await readUsers();
    const idx = users.findIndex(x => (u.id && x.id === u.id) || (u.email && x.email === u.email));
    const now = new Date().toISOString();
    const profile = {
      id: u.id || (`user_${(u.email||'anon').replace(/[^a-z0-9]/gi,'')}`),
      name: u.name || (u.email ? u.email.split('@')[0] : 'User'),
      // images are disabled: do not store profile images; use default avatar client-side
      // image field intentionally omitted to avoid storing images
      bio: u.bio || '',
      topics: u.topics || [],
      email: u.email || '',
      joined: u.joined || now,
      lastSeen: u.lastSeen || now
    };
    // Images disabled — strip any incoming image fields to ensure no images are stored
    try { console.log('[POST /api/users] upsert user', profile.id); } catch(e){}
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...profile };
      // Ensure no image property remains on stored user
      if (users[idx].hasOwnProperty('image')) delete users[idx].image;
    } else {
      users.push(profile);
    }
    const ok = await writeUsers(users);
    if (!ok) {
      console.error('Failed to persist user to users.json');
      return res.status(500).json({ error: 'Failed to persist user' });
    }
    return res.json({ ok: true, users });
  } catch (e) {
    console.error('POST /api/users error', e);
    return res.status(500).json({ error: 'Failed to persist user' });
  }
});

// Initialize Firebase Admin SDK (optional)
let admin = null;
try {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
    let serviceAccount = null;
    try { serviceAccount = JSON.parse(serviceAccountRaw); } catch (e) { serviceAccount = null; }
    if (serviceAccount) {
      admin = require('firebase-admin');
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('✅ Firebase Admin initialized');
    } else {
      console.warn('⚠️ serviceAccountKey.json exists but could not be parsed — Firebase disabled');
      admin = null;
    }
  } else {
    console.warn('⚠️ serviceAccountKey.json not found — Firebase disabled');
    admin = null;
  }
} catch (e) {
  console.warn('⚠️ Firebase Admin initialization failed:', e && e.message ? e.message : e);
  admin = null;
}

// In-memory OTP store
const otpStore = new Map();

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();


// Nodemailer support removed. Server will not attempt to send SMTP emails.
// To enable sending emails, install and configure an email provider and re-add mail-sending logic.

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const code = generateOtp();
  const expiresAt = Date.now() + (10 * 60 * 1000);
  otpStore.set(email, { code, expiresAt });

  // Email sending disabled on server. Show development OTP in logs; return code in response only if ALLOW_DEV_OTP=true
  console.warn('Email sending disabled on server — OTP will NOT be emailed.');
  console.log(`DEV OTP for ${email}: ${code} (expires ${new Date(expiresAt).toISOString()})`);

  if (process.env.ALLOW_DEV_OTP === 'true') {
    return res.json({ message: 'OTP generated (dev)', code });
  }

  return res.json({ message: 'OTP generated; email sending not configured' });
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'email, code and newPassword are required' });

  const entry = otpStore.get(email);
  if (!entry) return res.status(400).json({ error: 'No OTP requested for this email' });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (entry.code !== String(code)) return res.status(400).json({ error: 'Invalid OTP' });

  otpStore.delete(email);
  if (!admin) return res.status(500).json({ error: 'Server not configured to update passwords' });

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });
    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Error updating user password:', err);
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

// POST /api/auth/verify-otp-only
app.post('/api/auth/verify-otp-only', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'email and code are required' });

  const entry = otpStore.get(email);
  if (!entry) return res.status(400).json({ error: 'No OTP requested for this email' });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (entry.code !== String(code)) return res.status(400).json({ error: 'Invalid OTP' });

  return res.json({ message: 'OTP valid' });
});

// ✅ MESSAGE PERSISTENCE & ROUTES — MOVED ABOVE ERROR HANDLERS
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Ensure messages.json exists
try {
  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
    console.log('Initialized empty messages.json');
  }
} catch (e) {
  console.error('Failed to ensure messages.json exists', e);
}

async function readMessages() {
  try {
    const txt = await fsp.readFile(MESSAGES_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    return [];
  }
}

async function writeMessages(msgs) {
  try {
    await fsp.writeFile(MESSAGES_FILE, JSON.stringify(msgs, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write messages file', e);
    return false;
  }
}

// POST a message { from, to, text, ts }
app.post('/api/messages', async (req, res) => {
  try {
    const m = req.body || {};
    if (!m.from || !m.to || !m.text) return res.status(400).json({ error: 'from, to and text are required' });
    const messages = await readMessages();
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      from: m.from,
      to: m.to,
      text: m.text,
      ts: m.ts || new Date().toISOString()
    };
    messages.push(msg);
    await writeMessages(messages);
    return res.json({ ok: true, message: msg });
  } catch (e) {
    console.error('POST /api/messages error', e);
    return res.status(500).json({ error: 'Failed to persist message' });
  }
});

// GET messages between two users: /api/messages?user1=...&user2=...
app.get('/api/messages', async (req, res) => {
  try {
    const { user1, user2 } = req.query || {};
    if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 query params required' });
    const messages = await readMessages();
    const thread = messages.filter(m => (m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1));
    thread.sort((a,b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return res.json(thread);
  } catch (e) {
    console.error('GET /api/messages error', e);
    return res.status(500).json({ error: 'Failed to read messages' });
  }
});

// GET unread messages for a single user: /api/messages/unread?user=<uid>
app.get('/api/messages/unread', async (req, res) => {
  try {
    const { user } = req.query || {};
    if (!user) return res.status(400).json({ error: 'user query param required' });
    const messages = await readMessages();
    const inbox = messages.filter(m => m.to === user);
    inbox.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return res.json(inbox);
  } catch (e) {
    console.error('GET /api/messages/unread error', e);
    return res.status(500).json({ error: 'Failed to read messages' });
  }
});

// GET all messages (debug helper)
app.get('/api/messages/all', async (req, res) => {
  try {
    const messages = await readMessages();
    res.json(messages);
  } catch (e) {
    console.error('GET /api/messages/all error', e);
    res.status(500).json({ error: 'Failed to read messages' });
  }
});

// DELETE /api/messages/:id -> delete single message
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'message id required' });
    const messages = await readMessages();
    const next = messages.filter(m => m.id !== id);
    const ok = await writeMessages(next);
    if (!ok) return res.status(500).json({ error: 'Failed to delete message' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/messages/:id error', e);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

// DELETE /api/messages?user1=...&user2=... -> clear thread between two users
app.delete('/api/messages', async (req, res) => {
  try {
    const { user1, user2 } = req.query || {};
    if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });
    const messages = await readMessages();
    const next = messages.filter(m => !((m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1)));
    const ok = await writeMessages(next);
    if (!ok) return res.status(500).json({ error: 'Failed to clear messages' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/messages error', e);
    return res.status(500).json({ error: 'Failed to clear messages' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY)
  });
});

// Root - provide helpful JSON instead of 404
app.get('/', (req, res) => {
  res.json({ message: 'MindMeld server', health: '/api/health', docs: 'No UI served from server in dev' });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Hello from Node.js backend!',
    time: new Date().toISOString()
  });
});

// AI proxy endpoint
app.post('/api/ai', async (req, res) => {
  const { prompt, model = 'llama3-8b-8192', maxTokens = 512, messages } = req.body || {};
  const AI_PROVIDER = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.GROQ_API_KEY ? 'groq' : 'none'))).toLowerCase();

  if (!prompt && !messages) return res.status(400).json({ error: 'prompt or messages required' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  // --- GROQ INTEGRATION ---
  if (AI_PROVIDER === 'groq') {
    if (!GROQ_KEY) {
      console.warn('GROQ_API_KEY not configured — returning local fallback response');
      return res.json({ 
        id: `local_${Date.now()}`, 
        text: 'Local AI fallback: Groq not configured on server.', 
        model: 'local-fallback' 
      });
    }

    const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

    let fetchFn = global.fetch || require('node-fetch').default;
    if (!global.fetch && !fetchFn) {
      try { fetchFn = require('node-fetch'); } catch (e) { /* ignore */ }
    }
    if (!fetchFn) return res.status(500).json({ error: 'No fetch available on server' });

    try {
      let validModel = model;
      if (['llama3-8b-8192', 'llama3-70b-8192', 'llama3', 'llama3-8b'].includes(model)) {
        validModel = 'llama-3.1-8b-instant';
      }

      const groqPayload = messages
        ? { model: validModel, messages, max_tokens: maxTokens }
        : { model: validModel, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens };

      console.log('[AI proxy] forwarding to Groq:', GROQ_CHAT_COMPLETIONS_URL);
      console.log('[AI proxy] using model:', validModel);

      const groqRes = await fetchFn(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`
        },
        body: JSON.stringify(groqPayload)
      });

      const groqText = await groqRes.text();
      if (!groqRes.ok) {
        console.error('Groq error', groqRes.status, groqText);
        if (groqRes.status === 401 || groqRes.status === 403) {
          return res.status(502).json({ 
            error: 'Groq authentication error', 
            status: groqRes.status, 
            detail: 'Invalid or missing Groq API key' 
          });
        }
        let parsed;
        try { parsed = JSON.parse(groqText); } catch (e) { parsed = { raw: groqText }; }
        return res.json({ 
          id: `local_fallback_${Date.now()}`, 
          text: `AI proxy fallback: Groq returned ${groqRes.status}`, 
          rawError: parsed, 
          fallback: true 
        });
      }

      let groqData;
      try { groqData = JSON.parse(groqText); } catch (e) { groqData = { raw: groqText }; }

      const reply = groqData.choices?.[0]?.message?.content || 
                    groqData.choices?.[0]?.text || 
                    JSON.stringify(groqData);

      return res.json({ 
        id: groqData.id || `groq_${Date.now()}`, 
        text: reply, 
        model: validModel,
        raw: groqData 
      });

    } catch (err) {
      console.error('Groq proxy error:', err);
      return res.status(500).json({ 
        error: 'Groq proxy failed', 
        detail: err.message || String(err) 
      });
    }
  }

  // --- OPENAI FALLBACK ---
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try { fetchFn = require('node-fetch'); } catch (e) { fetchFn = null; }
  }
  if (!fetchFn) return res.status(500).json({ error: 'No fetch available on server' });

  try {
    console.log('[AI proxy] origin:', req.headers.origin || 'none');
    console.log('[AI proxy] body sample:', JSON.stringify({ prompt: !!prompt, messages: !!messages, model, maxTokens: maxTokens }));

    const payload = messages 
      ? { model, messages, max_tokens: maxTokens } 
      : { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens };

    const openaiRes = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const resText = await openaiRes.text();
    if (!openaiRes.ok) {
      console.error('OpenAI error', openaiRes.status, resText);
      if (openaiRes.status === 401 || openaiRes.status === 403) {
        return res.status(502).json({ 
          error: 'OpenAI authentication error', 
          status: openaiRes.status, 
          detail: resText || 'Invalid or missing OpenAI API key' 
        });
      }

      let parsed;
      try { parsed = JSON.parse(resText); } catch (e) { parsed = { raw: resText }; }
      return res.json({ 
        id: `local_fallback_${Date.now()}`, 
        text: `AI proxy fallback: OpenAI returned ${openaiRes.status}. (${openaiRes.statusText || ''})`, 
        rawError: parsed, 
        fallback: true 
      });
    }

    let data;
    try { data = JSON.parse(resText); } catch (e) { data = { raw: resText }; }
    const reply = data.choices?.[0]?.message?.content || '';

    return res.json({ 
      id: data.id || `openai_${Date.now()}`, 
      text: reply, 
      raw: data 
    });

  } catch (err) {
    console.error('AI proxy error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ 
      error: 'AI proxy failed', 
      detail: err && err.message ? err.message : String(err) 
    });
  }
});

// Protected & other endpoints
app.get('/api/protected', (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  res.json({ 
    message: 'Protected data accessed successfully',
    user: { uid: 'user-from-token', email: 'user@example.com' },
    timestamp: new Date().toISOString(),
    note: 'Firebase Admin SDK would verify the token here'
  });
});

app.post('/api/items', (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });
  res.status(201).json({ 
    id: 'item-' + Date.now(),
    title,
    description,
    userId: 'user-from-token',
    createdAt: new Date().toISOString(),
    message: 'Item created successfully'
  });
});

app.get('/api/items', (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const items = [
    { id: 'item-1', title: 'Sample Item 1', description: 'This is a sample item', userId: 'user-from-token', createdAt: new Date().toISOString() },
    { id: 'item-2', title: 'Sample Item 2', description: 'Another sample item', userId: 'user-from-token', createdAt: new Date().toISOString() }
  ];
  res.json(items);
});

// ✅ ERROR HANDLERS — MUST COME LAST
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ✅ FIXED PORT — was `z``;` before
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:5174'}`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
});
