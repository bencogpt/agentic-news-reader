import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

function getClientApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

let clientDb: Firestore | null = null;
let clientAuth: Auth | null = null;

export function getClientFirestore(): Firestore {
  if (!clientDb) {
    clientDb = getFirestore(getClientApp());
  }
  return clientDb;
}

export function getClientAuth(): Auth {
  if (!clientAuth) {
    clientAuth = getAuth(getClientApp());
  }
  return clientAuth;
}
