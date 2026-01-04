// Quick helper: list first 50 users in Firestore
// Usage: node list_users_firestore.js
// Requires server/serviceAccountKey.json present

const admin = require('firebase-admin');
const fs = require('fs');

const svcPath = './serviceAccountKey.json';
if (!fs.existsSync(svcPath)) {
  console.error('serviceAccountKey.json not found in server/ — cannot initialize Firebase Admin');
  process.exit(2);
}

const svc = require(svcPath);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

(async () => {
  try {
    const snap = await db.collection('users').limit(50).get();
    console.log('Found users:', snap.size);
    snap.forEach(doc => {
      const d = doc.data();
      console.log('-', doc.id, '|', d.name || '-', '| image:', d.image ? (d.image.length > 80 ? d.image.slice(0,80) + '...' : d.image) : 'no-image');
    });
    process.exit(0);
  } catch (e) {
    console.error('Failed to list users:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
