/**
 * Firebase authentication utilities
 */

'use client';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseAuth } from './config';

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

const auth = () => getFirebaseAuth();

export const signUp = async (email: string, password: string, displayName: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth(), email, password);
  
  if (userCredential.user) {
    await updateProfile(userCredential.user, { displayName });
    await sendEmailVerification(userCredential.user);
  }
  
  return userCredential.user;
};

export const resendVerificationEmail = async () => {
  const user = auth().currentUser;
  if (!user) throw new Error('No user signed in');
  if (user.emailVerified) throw new Error('Email already verified');
  await sendEmailVerification(user);
};

export const signIn = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth(), email, password);
  return userCredential.user;
};

export const signInWithGoogle = async () => {
  try {
    const userCredential = await signInWithPopup(auth(), googleProvider);
    return userCredential.user;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/popup-blocked') {
      await signInWithRedirect(auth(), googleProvider);
      return null;
    }
    throw error;
  }
};

export const signInWithGithub = async () => {
  try {
    const userCredential = await signInWithPopup(auth(), githubProvider);
    return userCredential.user;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/popup-blocked') {
      await signInWithRedirect(auth(), githubProvider);
      return null;
    }
    throw error;
  }
};

export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth());
    return result?.user ?? null;
  } catch {
    return null;
  }
};

export const signInAsGuest = async (displayName: string) => {
  const userCredential = await signInAnonymously(auth());
  if (userCredential.user) {
    await updateProfile(userCredential.user, { displayName: displayName || 'Guest' });
  }
  return userCredential.user;
};

export const signOut = async () => {
  // Clear presence immediately so the user shows as offline right away
  const currentUser = auth().currentUser;
  if (currentUser) {
    const { clearPresence } = await import('@/lib/supabase/client');
    await clearPresence(currentUser.uid).catch(() => {});
  }
  // Clear cached auth so useAuth returns null instantly
  try { sessionStorage.removeItem('collabboard_auth_user'); } catch { /* noop */ }
  await firebaseSignOut(auth());
};

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  try {
    return onAuthStateChanged(auth(), callback);
  } catch (error) {
    console.error(error);
    callback(null);
    return () => {};
  }
};

export const getCurrentUser = () => {
  try {
    return auth().currentUser;
  } catch {
    return null;
  }
};

export const getIdToken = async () => {
  let user: FirebaseUser | null = null;

  try {
    user = auth().currentUser;
  } catch {
    return null;
  }

  if (!user) return null;
  return await user.getIdToken();
};
