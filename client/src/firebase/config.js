import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDwX6yBiQrXm8Rligchhoq1woa3nCxYUlg",
  authDomain: "myproject-f5c4a.firebaseapp.com",
  projectId: "myproject-f5c4a",
  storageBucket: "myproject-f5c4a.firebasestorage.app",
  messagingSenderId: "23602905382",
  appId: "1:23602905382:web:a7c0c3044566b39d8c81e7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// Log initialization
console.log("🔥 Firebase initialized for project:", firebaseConfig.projectId);

export { app, auth, db };
export default app;