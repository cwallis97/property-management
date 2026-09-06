// src/firebase.js
//
// Only Firebase Authentication is used by this app. Firestore and Storage
// were imported here historically but nothing consumes them — importing
// them pulled the Firestore/gRPC/protobuf and Storage SDK surfaces into
// the bundle for no reason. Keeping this file to `firebase/app` +
// `firebase/auth` keeps the shipped code (and its dependency surface)
// scoped to what the product actually does.
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

// The Firebase Web config is a set of public client identifiers (it also
// ships in the built bundle) — not a secret. Access is governed by the
// Firebase project's own settings (authorized domains, Security Rules,
// App Check), configured in the Firebase console, not here.
const firebaseConfig = {
  apiKey: "AIzaSyCOMHD2ViZH-5lv3SxSqayLGx5tfzPCGXM",
  authDomain: "wallisworks-42c74.firebaseapp.com",
  projectId: "wallisworks-42c74",
  storageBucket: "wallisworks-42c74.appspot.com",
  messagingSenderId: "93784898598",
  appId: "1:93784898598:web:50b49a2ce0dcb71f33bae7",
};

const app = initializeApp(firebaseConfig);

// Auth with session persistence (localStorage-backed; managed by the
// Firebase SDK).
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export { auth };
