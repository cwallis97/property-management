// src/firebase.js
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ Your Firebase config (already filled in correctly)
const firebaseConfig = {
  apiKey: "AIzaSyCOMHD2ViZH-5lv3SxSqayLGx5tfzPCGXM",
  authDomain: "wallisworks-42c74.firebaseapp.com",
  projectId: "wallisworks-42c74",
  storageBucket: "wallisworks-42c74.appspot.com",
  messagingSenderId: "93784898598",
  appId: "1:93784898598:web:50b49a2ce0dcb71f33bae7",
};

// ✅ Initialize Firebase core
const app = initializeApp(firebaseConfig);

// ✅ Auth setup with session persistence
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// ✅ Firestore (database) + Storage (for uploads)
const db = getFirestore(app);
const storage = getStorage(app);

// Exports
export { auth, db, storage };
