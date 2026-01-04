/*
Migration script: migrate local users.json and messages.json to Firebase (Firestore + Storage)
Run from project server folder:
  npm install firebase-admin mime
  node migrate_to_firebase.js

Preconditions:
 - server/serviceAccountKey.json must exist and be valid
 - users.json and messages.json should be present in the same folder

What it does:
 - Initializes Firebase Admin using serviceAccountKey.json
 - Uploads data URLs found in user.image to Storage and replaces with signed URL
 - Writes users to Firestore collection 'users' (document id = user.id)
 - Writes messages to Firestore collection 'messages' with field threadId
 - Logs summary and failures
*/

const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');
const mimeTypes = require('mime-types');

const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'users.json');
const MESSAGES_FILE = path.join(ROOT, 'messages.json');
const SERVICE_ACCOUNT = path.join(ROOT, 'serviceAccountKey.json');

async function ensureServiceAccount() {
  try {
    const txt = await fs.readFile(SERVICE_ACCOUNT, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('serviceAccountKey.json not found or invalid. Put your service account JSON at', SERVICE_ACCOUNT);
    throw e;
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');
  return { mimeType, buffer };
}

async function uploadAvatar(bucket, userId, imageData) {
  try {
    const parsed = parseDataUrl(imageData);
    if (!parsed) return null;
    // use mime-types to resolve extension from mime type
    const ext = mimeTypes.extension(parsed.mimeType) || 'bin';
    const filename = `avatars/${userId}/${Date.now()}.${ext}`;
    const file = bucket.file(filename);
    await file.save(parsed.buffer, { contentType: parsed.mimeType });
    // Make the file non-public but create a long-lived signed URL (10 years)
    const [url] = await file.getSignedUrl({ action: 'read', expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) });
    return { filename, url };
  } catch (e) {
    console.warn('uploadAvatar error for', userId, e && e.message ? e.message : e);
    return null;
  }
}

async function main() {
  try {
    const svc = await ensureServiceAccount();
    const projectId = svc.project_id;
    const bucketName = `${projectId}.appspot.com`;
    admin.initializeApp({ credential: admin.credential.cert(svc), storageBucket: bucketName });
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    console.log('Firebase initialized. Project:', projectId, 'Bucket:', bucketName);

    // Quick check: ensure Firestore database exists / is enabled for this project
    try {
      // Attempt to list collections - if Firestore isn't initialized this may throw
      await db.listCollections();
    } catch (err) {
      console.error('Firestore does not appear to be enabled for this project.');
      console.error('Please open the Firebase Console for project', projectId, 'and create a Firestore database (Firestore → Create database).');
      console.error('Detailed error:', err && err.message ? err.message : err);
      return process.exitCode = 2;
    }

    // read users
    let users = [];
    try {
      const raw = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(raw);
      if (!Array.isArray(users)) throw new Error('users.json is not an array');
    } catch (e) {
      console.error('Failed to read users.json:', e && e.message ? e.message : e);
      return process.exitCode = 2;
    }

    // read messages
    let messages = [];
    try {
      const raw = await fs.readFile(MESSAGES_FILE, 'utf8');
      messages = JSON.parse(raw);
      if (!Array.isArray(messages)) messages = [];
    } catch (e) {
      console.warn('messages.json read failed or missing; continuing without messages');
      messages = [];
    }

    console.log('Migrating', users.length, 'users and', messages.length, 'messages');

    const userDocs = db.collection('users');
    let uploadedAvatars = 0;

    for (const u of users) {
      const docId = u.id;
      const docData = { ...u };
      // remove large blobs if present; prefer storing image as URL
      if (docData.image && typeof docData.image === 'string' && docData.image.startsWith('data:')) {
        const res = await uploadAvatar(bucket, docId, docData.image);
        if (res && res.url) {
          docData.image = res.url;
          uploadedAvatars++;
        } else {
          // fallback: remove inline image
          delete docData.image;
        }
      }
      try {
        await userDocs.doc(String(docId)).set(docData, { merge: true });
        console.log('Wrote user', docId);
      } catch (e) {
        console.warn('Failed to write user', docId, e && e.message ? e.message : e);
      }
    }

    // Migrate messages
    if (messages.length > 0) {
      const msgsCol = db.collection('messages');
      for (const m of messages) {
        try {
          // compute thread id: sorted pair of participants if available, else m.thread || m.id
          let threadId = m.thread || m.threadId || null;
          if (!threadId && m.from && m.to) {
            const ids = [m.from, m.to].map(String).sort();
            threadId = `${ids[0]}_${ids[1]}`;
          }
          const doc = { ...m, threadId, migratedAt: new Date().toISOString() };
          const docRef = msgsCol.doc(m.id || `${threadId}_${Date.now()}`);
          await docRef.set(doc, { merge: true });
        } catch (e) {
          console.warn('Failed to write message', m.id, e && e.message ? e.message : e);
        }
      }
      console.log('Migrated messages to Firestore collection messages');
    }

    console.log('Migration complete. Avatars uploaded:', uploadedAvatars);
    console.log('Verify data in Firebase console or via firestore client.');
  } catch (e) {
    console.error('Migration failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }
}

main();
