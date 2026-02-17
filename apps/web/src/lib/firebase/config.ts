/**
 * Firebase configuration
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firebaseInitError: Error | null = null;

const getMissingFirebaseEnvVars = (): string[] => {
  return Object.entries(firebaseEnv)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([key]) => key);
};

const createFirebaseConfigError = (missingVars: string[]) =>
  new Error(
    `Firebase is not configured correctly. Missing environment variables: ${missingVars.join(
      ', '
    )}. Add them to whiteboard-frontend/.env.local and restart the Next.js dev server.`
  );

const initializeFirebase = () => {
  if (typeof window === 'undefined' || auth || firebaseInitError) {
    return;
  }

  const missingVars = getMissingFirebaseEnvVars();
  if (missingVars.length > 0) {
    firebaseInitError = createFirebaseConfigError(missingVars);
    return;
  }

  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
  } catch (error) {
    firebaseInitError =
      error instanceof Error
        ? error
        : new Error('Failed to initialize Firebase Auth.');
  }
};

export const getFirebaseAuth = (): Auth => {
  initializeFirebase();

  if (firebaseInitError) {
    throw firebaseInitError;
  }

  if (!auth) {
    throw new Error('Firebase Auth is unavailable.');
  }

  return auth;
};

export { app };
