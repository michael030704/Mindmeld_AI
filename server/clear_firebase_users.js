// 🧹 Script to clear all users from Firebase

require('dotenv').config();
const admin = require('firebase-admin');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccountKey.json';
let serviceAccount;

try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.error('❌ Cannot load service account:', e.message);
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearAllUsers() {
  try {
    console.log('🔄 Fetching all users from Firebase...');
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('✅ No users to delete');
      process.exit(0);
    }

    console.log(`📊 Found ${usersSnapshot.size} users to delete`);
    
    let deleted = 0;
    const batch = db.batch();

    usersSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      deleted++;
    });

    await batch.commit();
    console.log(`✅ Successfully deleted ${deleted} users from Firebase`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing users:', error);
    process.exit(1);
  }
}

clearAllUsers();
