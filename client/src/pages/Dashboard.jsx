// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your config (yours already has this filled in)
const firebaseConfig = {
  apiKey: "AIzaSyCOMHD2ViZH-5lv3SxSqayLGx5tfzPCGXM",
  authDomain: "wallisworks-42c74.firebaseapp.com",
  projectId: "wallisworks-42c74",
  storageBucket: "wallisworks-42c74.appspot.com",
  messagingSenderId: "93784898598",
  appId: "1:93784898598:web:50b49a2ce0dcb71f33bae7",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth service
const auth = getAuth(app);

// ✅ Make login persist across page reloads
setPersistence(auth, browserLocalPersistence);

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
