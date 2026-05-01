// Quick helper: delete all users in Firestore
// Usage: node delete_users_firestore.js
// WARNING: This will permanently delete ALL user documents in Firestore!
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
    console.log('Fetching all users...');
    const snap = await db.collection('users').get();
    console.log(`Found ${snap.size} users to delete.`);
    if (snap.size === 0) {
      console.log('No users to delete.');
      process.exit(0);
    }
    console.log('Deleting users...');
    const batch = db.batch();
    snap.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Successfully deleted ${snap.size} users from Firestore.`);
    process.exit(0);
  } catch (e) {
    console.error('Failed to delete users:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();