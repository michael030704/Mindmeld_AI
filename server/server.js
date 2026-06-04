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
const normalizeServerUserName = (rawName, id, email) => {
  // Priority 1: If rawName is a non-empty string, use it
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name && name !== 'undefined' && name.length > 0) {
    return name;
  }
  
  // Priority 2: Extract from email
  if (email && String(email).trim()) {
    return String(email).split('@')[0];
  }
  
  // Fallback: Use ID as name
  const normalizedId = id ? String(id).trim() : '';
  if (normalizedId) {
    return normalizedId;
  }
  
  // Last resort
  return 'User';
};

// GET all users (from Firebase with fallback to local JSON)
app.get('/api/users', async (req, res) => {
  try {
    let users = [];
    
    // 🔥 Try Firebase first
    if (admin && db) {
      users = await getUsersFromFirebase();
      if (users.length > 0) {
        console.log(`[GET /api/users] Loaded ${users.length} users from Firebase`);
        return res.json(users);
      }
    }
    
    // Fallback to local JSON
    users = await readUsers();
    console.log(`[GET /api/users] Loaded ${users.length} users from local JSON`);
    return res.json(users);
  } catch (e) {
    console.error('[GET /api/users] Error:', e);
    return res.status(500).json({ error: 'Failed to read users' });
  }
});

// GET search users: /api/users/search?q=<query> (from Firebase with fallback)
app.get('/api/users/search', async (req, res) => {
  try {
    const { q } = req.query || {};
    let users = [];
    
    // 🔥 Try Firebase first
    if (admin && db) {
      users = await getUsersFromFirebase();
      if (users.length > 0) {
        console.log(`[GET /api/users/search] Searching ${users.length} Firebase users`);
      }
    }
    
    // Fallback to local JSON if Firebase empty
    if (users.length === 0) {
      users = await readUsers();
      console.log(`[GET /api/users/search] Searching ${users.length} local users`);
    }
    
    if (!q || q.trim() === '') {
      return res.json(users);
    }
    
    const query = q.toLowerCase();
    const results = users.filter(u => 
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.id && u.id.toLowerCase().includes(query))
    );
    console.log(`[GET /api/users/search] Query="${q}" returned ${results.length} results`);
    return res.json(results);
  } catch (e) {
    console.error('GET /api/users/search error', e);
    return res.status(500).json({ error: 'Failed to search users' });
  }
});

// GET /api/users/:id - Get user profile by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'user id required' });
    
    // Try Firebase first
    if (admin && db) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          console.log(`[GET /api/users/:id] Found ${userId} in Firebase`);
          return res.json(userDoc.data());
        }
      } catch (err) {
        console.warn(`[GET /api/users/:id] Firebase error:`, err.message);
      }
    }
    
    // Fallback to JSON
    const users = await readUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      console.log(`[GET /api/users/:id] Found ${userId} in JSON`);
      return res.json(user);
    }
    
    return res.status(404).json({ error: 'User not found' });
  } catch (e) {
    console.error('GET /api/users/:id error', e);
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// POST /api/users/:id/online - Update user online status (create if not exists)
app.post('/api/users/:id/online', async (req, res) => {
  try {
    const userId = req.params.id;
    const { isOnline } = req.body || {};
    
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    
    console.log(`[POST /api/users/:id/online] Updating ${userId} - isOnline=${isOnline}`);
    
    // Update in Firebase
    if (admin && db) {
      try {
        // First check if user exists in Firebase
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (userDoc.exists) {
          // User exists, just update online status
          const success = await updateUserOnlineStatus(userId, isOnline === true);
          if (success) {
            console.log(`[POST /api/users/:id/online] ✅ Updated in Firebase`);
            return res.json({ ok: true, userId, isOnline: isOnline === true, message: `User ${isOnline ? 'came online' : 'went offline'}` });
          }
        } else {
          // User doesn't exist in Firebase, create minimal profile
          console.log(`[POST /api/users/:id/online] User not in Firebase, creating minimal profile`);
          const minimalProfile = {
            id: userId,
            name: 'User',
            email: '',
            displayName: 'User',
            isOnline: isOnline === true,
            lastSeen: new Date().toISOString(),
            followers: [],
            following: [],
            notifications: [],
            topics: [],
            bio: '',
            joined: new Date().toISOString()
          };
          await updateUserInFirebase(userId, minimalProfile);
          return res.json({ ok: true, userId, isOnline: isOnline === true, created: true });
        }
      } catch (err) {
        console.error(`[POST /api/users/:id/online] Firebase error:`, err.message);
      }
    }
    
    // Fallback: Update in local JSON
    const users = await readUsers();
    let idx = users.findIndex(u => u.id === userId);
    
    if (idx !== -1) {
      // User exists, update
      users[idx].lastSeen = new Date().toISOString();
      if (isOnline !== undefined) users[idx].isOnline = isOnline;
      await writeUsers(users);
      console.log(`[POST /api/users/:id/online] ✅ Updated in JSON`);
      return res.json({ ok: true, userId, isOnline: isOnline === true });
    } else {
      // User doesn't exist in JSON either, create minimal profile
      console.log(`[POST /api/users/:id/online] User not in JSON, creating minimal profile`);
      const minimalProfile = {
        id: userId,
        name: 'User',
        email: '',
        displayName: 'User',
        isOnline: isOnline === true,
        lastSeen: new Date().toISOString(),
        followers: [],
        following: [],
        notifications: [],
        topics: [],
        bio: '',
        joined: new Date().toISOString()
      };
      users.push(minimalProfile);
      await writeUsers(users);
      console.log(`[POST /api/users/:id/online] ✅ Created in JSON`);
      return res.json({ ok: true, userId, isOnline: isOnline === true, created: true });
    }
  } catch (e) {
    console.error('POST /api/users/:id/online error', e);
    return res.status(500).json({ error: 'Failed to update online status: ' + e.message });
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
      users.push({ id: targetId, name: 'User', email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      tIdx = users.length - 1;
    }
    // Ensure follower user exists; create placeholder if missing
    let fIdx = users.findIndex(u => u.id === followerId);
    if (fIdx === -1) {
      users.push({ id: followerId, name: 'User', email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      fIdx = users.length - 1;
    }
    users[tIdx].followers = Array.isArray(users[tIdx].followers) ? users[tIdx].followers : [];
    users[fIdx].following = Array.isArray(users[fIdx].following) ? users[fIdx].following : [];
    if (!users[tIdx].followers.includes(followerId)) users[tIdx].followers.push(followerId);
    if (!users[fIdx].following.includes(targetId)) users[fIdx].following.push(targetId);
    const ok = await writeUsers(users);
    try { console.log(`User ${followerId} now follows ${targetId}. followers=${users[tIdx].followers.length}, following=${users[fIdx].following.length}`); } catch(e){}
    
    // 🔥 Also update in Firebase
    if (admin && db) {
      try {
        await updateUserInFirebase(targetId, { followers: users[tIdx].followers });
        await updateUserInFirebase(followerId, { following: users[fIdx].following });
        console.log(`[POST /api/users/:id/follow] ✅ Updated in Firebase`);
      } catch (err) {
        console.warn(`[POST /api/users/:id/follow] Firebase update failed:`, err.message);
      }
    }
    
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
      users.push({ id: targetId, name: 'User', email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      tIdx = users.length - 1;
    }
    let fIdx = users.findIndex(u => u.id === followerId);
    if (fIdx === -1) {
      users.push({ id: followerId, name: 'User', email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
      fIdx = users.length - 1;
    }
    users[tIdx].followers = (users[tIdx].followers || []).filter(id => id !== followerId);
    users[fIdx].following = (users[fIdx].following || []).filter(id => id !== targetId);
    const ok = await writeUsers(users);
    try { console.log(`User ${followerId} unfollowed ${targetId}. followers=${users[tIdx].followers.length}, following=${users[fIdx].following.length}`); } catch(e){}
    
    // 🔥 Also update in Firebase
    if (admin && db) {
      try {
        await updateUserInFirebase(targetId, { followers: users[tIdx].followers });
        await updateUserInFirebase(followerId, { following: users[fIdx].following });
        console.log(`[POST /api/users/:id/unfollow] ✅ Updated in Firebase`);
      } catch (err) {
        console.warn(`[POST /api/users/:id/unfollow] Firebase update failed:`, err.message);
      }
    }
    
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
      users.push({ id: uid, name: 'User', email: '', joined: new Date().toISOString(), lastSeen: new Date().toISOString(), followers: [], following: [], notifications: [] });
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

// POST upsert user (id or email) - Save to Firebase AND local JSON
app.post('/api/users', async (req, res) => {
  try {
    const u = req.body || {};
    if (!u || (!u.id && !u.email)) return res.status(400).json({ error: 'User id or email required' });
    
    const now = new Date().toISOString();
    const id = u.id || (`user_${(u.email||'anon').replace(/[^a-z0-9]/gi,'')}`);
    
    console.log('📥 [POST /api/users] Received:', {
      id: u.id,
      name: u.name,
      email: u.email,
      displayName: u.displayName,
      bio: u.bio,
      firstName: u.firstName,
      middleName: u.middleName,
      lastName: u.lastName
    });
    
    // 🔧 Use u.displayName if available, otherwise u.name, otherwise fallback
    const finalName = u.displayName || u.name || normalizeServerUserName(u.name, id, u.email);
    
    const profile = {
      id,
      name: finalName,
      bio: u.bio || '',
      topics: u.topics || [],
      email: u.email || '',
      joined: u.joined || now,
      lastSeen: u.lastSeen || now,
      isOnline: u.isOnline || false,
      displayName: finalName,
      followers: u.followers || [],
      following: u.following || [],
      notifications: u.notifications || []
    };
    
    console.log('✅ [POST /api/users] Created profile:', {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      displayName: profile.displayName
    });
    
    // 🔥 Save to Firebase
    if (admin && db) {
      try {
        await updateUserInFirebase(id, profile);
        console.log(`[POST /api/users] User ${id} saved to Firebase`);
      } catch (err) {
        console.error(`[POST /api/users] Firebase save failed:`, err);
      }
    }
    
    // Save to local JSON (fallback)
    const users = await readUsers();
    const idx = users.findIndex(x => (u.id && x.id === u.id) || (u.email && x.email === u.email));
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...profile };
      if (users[idx].hasOwnProperty('image')) delete users[idx].image;
    } else {
      users.push(profile);
    }
    const ok = await writeUsers(users);
    if (!ok) {
      console.error('Failed to persist user to users.json');
      return res.status(500).json({ error: 'Failed to persist user' });
    }
    return res.json({ ok: true, user: profile, users });
  } catch (e) {
    console.error('POST /api/users error', e);
    return res.status(500).json({ error: 'Failed to persist user' });
  }
});

// DELETE /api/users - Clear all users (dangerous, for admin use only)
app.delete('/api/users', async (req, res) => {
  try {
    const ok = await writeUsers([]);
    if (!ok) {
      console.error('Failed to clear users.json');
      return res.status(500).json({ error: 'Failed to clear users' });
    }
    console.log('Cleared all users from users.json');
    return res.json({ ok: true, message: 'All users cleared' });
  } catch (e) {
    console.error('DELETE /api/users error', e);
    return res.status(500).json({ error: 'Failed to clear users' });
  }
});

// ✅ Initialize Firebase Admin SDK — supports env var OR local file
let admin = null;
let db = null;
try {
  let serviceAccount = null;

  // 🔑 Option 1: Load from environment variable (Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('✅ Attempting to initialize Firebase from FIREBASE_SERVICE_ACCOUNT env var');
    } catch (e) {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
      serviceAccount = null;
    }
  }

  // 💻 Option 2: Load from local file (development)
  if (!serviceAccount) {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
      try {
        serviceAccount = JSON.parse(serviceAccountRaw);
        console.log('✅ Attempting to initialize Firebase from local serviceAccountKey.json');
      } catch (e) {
        console.warn('⚠️ serviceAccountKey.json is not valid JSON:', e.message);
        serviceAccount = null;
      }
    }
  }

  // 🚀 Initialize if we have valid credentials
  if (serviceAccount) {
    admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    console.log('✅ Firebase Admin SDK successfully initialized');
    console.log('✅ Firestore database connected');
  } else {
    console.log('ℹ️  Firebase Admin SDK not configured — using local JSON file persistence');
  }
} catch (e) {
  console.warn('⚠️ Firebase Admin initialization failed:', e.message || e);
  admin = null;
  db = null;
}

// ✅ Firebase Firestore User Functions
async function getUsersFromFirebase() {
  if (!admin || !db) return [];
  try {
    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        name: userData.displayName || userData.name || 'User',
        email: userData.email || '',
        bio: userData.bio || '',
        topics: userData.topics || [],
        joined: userData.joined || new Date().toISOString(),
        lastSeen: userData.lastSeen || new Date().toISOString(),
        isOnline: userData.isOnline || false,
        followers: userData.followers || [],
        following: userData.following || [],
        notifications: userData.notifications || []
      });
    });
    return users;
  } catch (err) {
    console.error('Error reading users from Firebase:', err);
    return [];
  }
}

async function getUserFromFirebase(userId) {
  if (!admin || !db) return null;
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    const userData = doc.data();
    return {
      id: doc.id,
      name: userData.displayName || userData.name || 'User',
      email: userData.email || '',
      bio: userData.bio || '',
      topics: userData.topics || [],
      joined: userData.joined || new Date().toISOString(),
      lastSeen: userData.lastSeen || new Date().toISOString(),
      isOnline: userData.isOnline || false,
      followers: userData.followers || [],
      following: userData.following || [],
      notifications: userData.notifications || []
    };
  } catch (err) {
    console.error('Error reading user from Firebase:', err);
    return null;
  }
}

async function updateUserInFirebase(userId, updates) {
  if (!admin || !db) return false;
  try {
    await db.collection('users').doc(userId).set(updates, { merge: true });
    return true;
  } catch (err) {
    console.error('Error updating user in Firebase:', err);
    return false;
  }
}

async function updateUserOnlineStatus(userId, isOnline) {
  if (!admin || !db) return false;
  try {
    await db.collection('users').doc(userId).update({
      isOnline,
      lastSeen: new Date().toISOString()
    });
    console.log(`[PRESENCE] User ${userId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    return true;
  } catch (err) {
    console.error('Error updating user presence:', err);
    return false;
  }
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
      ts: m.ts || new Date().toISOString(),
      status: m.status || 'sent', // 'sent', 'pending', 'accepted'
      isPending: m.isPending || false // Mark as pending if from doesn't follow to
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

// GET pending message requests for a user: /api/messages/requests?user=<uid>
app.get('/api/messages/requests', async (req, res) => {
  try {
    const { user } = req.query || {};
    if (!user) return res.status(400).json({ error: 'user query param required' });
    
    // Get all followers of this user
    const users = await getUsersFromFirebase();
    if (users.length === 0) {
      await readUsers(); // fallback
    }
    const targetUser = users.find(u => u.id === user);
    const followerIds = targetUser?.followers || [];
    
    // Get messages from followers who are not followed back
    const messages = await readMessages();
    const following = targetUser?.following || [];
    
    const pendingRequests = messages.filter(m => {
      // Message is from a follower who we don't follow back
      return m.to === user && 
             followerIds.includes(m.from) && 
             !following.includes(m.from);
    });
    
    // Group by sender
    const grouped = {};
    pendingRequests.forEach(msg => {
      if (!grouped[msg.from]) {
        grouped[msg.from] = [];
      }
      grouped[msg.from].push(msg);
    });
    
    return res.json(grouped);
  } catch (e) {
    console.error('GET /api/messages/requests error', e);
    return res.status(500).json({ error: 'Failed to read message requests' });
  }
});

// POST /api/messages/requests/:fromUserId/accept - Accept a message request and auto-follow
app.post('/api/messages/requests/:fromUserId/accept', async (req, res) => {
  try {
    const fromUserId = req.params.fromUserId;
    const { toUserId } = req.body || {};
    if (!toUserId) return res.status(400).json({ error: 'toUserId required' });
    
    const users = await getUsersFromFirebase();
    if (users.length === 0) {
      await readUsers(); // fallback
    }
    
    // Add to following list
    const idx = users.findIndex(u => u.id === toUserId);
    if (idx !== -1) {
      users[idx].following = users[idx].following || [];
      if (!users[idx].following.includes(fromUserId)) {
        users[idx].following.push(fromUserId);
      }
      
      // Update Firebase
      if (admin && db) {
        await updateUserInFirebase(toUserId, { following: users[idx].following });
      }
      await writeUsers(users);
    }
    
    return res.json({ ok: true, message: 'Message request accepted' });
  } catch (e) {
    console.error('POST /api/messages/requests/:fromUserId/accept error', e);
    return res.status(500).json({ error: 'Failed to accept message request' });
  }
});

// DELETE /api/messages/requests/:fromUserId - Delete/decline a message request
app.delete('/api/messages/requests/:fromUserId', async (req, res) => {
  try {
    const fromUserId = req.params.fromUserId;
    const { toUserId } = req.query || {};
    if (!toUserId) return res.status(400).json({ error: 'toUserId query param required' });
    
    // Delete messages from this user to toUserId
    const messages = await readMessages();
    const next = messages.filter(m => !(m.from === fromUserId && m.to === toUserId));
    await writeMessages(next);
    
    return res.json({ ok: true, message: 'Message request deleted' });
  } catch (e) {
    console.error('DELETE /api/messages/requests/:fromUserId error', e);
    return res.status(500).json({ error: 'Failed to delete message request' });
  }
});

// POST /api/messages/requests/:fromUserId/block - Block a user
app.post('/api/messages/requests/:fromUserId/block', async (req, res) => {
  try {
    const fromUserId = req.params.fromUserId;
    const { toUserId } = req.body || {};
    if (!toUserId) return res.status(400).json({ error: 'toUserId required' });
    
    // Remove from followers list
    const users = await getUsersFromFirebase();
    if (users.length === 0) {
      await readUsers(); // fallback
    }
    
    const idx = users.findIndex(u => u.id === toUserId);
    if (idx !== -1) {
      users[idx].followers = (users[idx].followers || []).filter(id => id !== fromUserId);
      
      // Update Firebase
      if (admin && db) {
        await updateUserInFirebase(toUserId, { followers: users[idx].followers });
      }
      await writeUsers(users);
    }
    
    // Delete all messages from this user
    const messages = await readMessages();
    const next = messages.filter(m => !(m.from === fromUserId && m.to === toUserId));
    await writeMessages(next);
    
    return res.json({ ok: true, message: 'User blocked and messages deleted' });
  } catch (e) {
    console.error('POST /api/messages/requests/:fromUserId/block error', e);
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    firebaseConfigured: Boolean(admin)
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

  // --- DEMO MODE (no API keys configured) ---
  if (AI_PROVIDER === 'none') {
    console.log('[AI] Demo mode - no API keys configured. Set GROQ_API_KEY or OPENAI_API_KEY in server/.env');
    // Extract the last user message for context
    let userMessage = prompt || '';
    if (messages && messages.length > 0) {
      userMessage = messages[messages.length - 1]?.content || '';
    }
    
    // Demo responses based on user message keywords
    const lowerMessage = userMessage.toLowerCase();
    let response = '';
    
    if (lowerMessage.includes('rizal')) {
      response = 'José Rizal (1861-1896) was a Filipino nationalist, writer, and physician. He wrote two famous novels: "Noli Me Tangere" (Touch Me Not) and "El Filibusterismo" (The Reign of Greed). His works criticized Spanish colonial rule and promoted reform. He was executed by the Spanish, which sparked the Philippine Revolution.';
    } else if (lowerMessage.includes('bonifacio')) {
      response = 'Andres Bonifacio (1863-1897) was a Filipino revolutionary leader and founder of the Katipunan (secret society). He played a crucial role in initiating the Philippine Revolution against Spanish colonial rule. He is considered the Father of the Philippine Revolution and remains a national hero.';
    } else if (lowerMessage.includes('learning') || lowerMessage.includes('study') || lowerMessage.includes('improve')) {
      response = 'Effective learning strategies: 1) Active recall - test yourself frequently on material, 2) Spaced repetition - review at increasing intervals, 3) Interleaving - mix different topics and problem types, 4) Teaching others - explain concepts aloud, 5) Take breaks - your brain needs rest to consolidate memories. Which strategy would you like to focus on?';
    } else if (lowerMessage.includes('thanks') || lowerMessage.includes('thank you')) {
      response = 'You\'re welcome! 😊 Feel free to ask me anything about learning, study strategies, or topics you\'re curious about. I\'m here to help you learn more effectively!';
    } else if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
      response = 'Hi there! 👋 I\'m your AI Learning Mentor. I can help you with study strategies, learning techniques, historical topics, and more. What would you like to learn about today?';
    } else {
      response = 'Great question! I\'m running in demo mode. For real AI responses powered by Groq, configure GROQ_API_KEY in server/.env. In the meantime, I can help with general learning tips and questions. What would you like to know?';
    }
    
    return res.json({
      id: `demo_${Date.now()}`,
      text: response,
      model: 'demo-mode',
      demoMode: true
    });
  }

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

    // ✅ FIXED: Removed trailing spaces from URL
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

    // ✅ FIXED: Removed trailing spaces from URL
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

// Serve built client assets and fallback to index for SPA routes in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
console.log('Client dist path:', clientDist, 'exists:', fs.existsSync(clientDist));
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// ✅ FIXED PORT — was `z``;` before
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:5174'}`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
});