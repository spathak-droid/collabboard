/**
 * Custom hook for authentication state
 *
 * Caches the Firebase user in sessionStorage so subsequent page loads
 * (and client-side navigations) restore the user instantly instead of
 * waiting 1-2 s for Firebase's onAuthStateChanged cold callback.
 */

'use client';

import { useState, useEffect } from 'react';
import { onAuthChange } from '@/lib/firebase/auth';
import type { User } from '@/types/user';

const CACHE_KEY = 'collabboard_auth_user';

const readCache = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const writeCache = (user: User | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // quota exceeded — ignore
  }
};

export const useAuth = () => {
  // Always start with null/true so server and client render the same (avoids hydration mismatch).
  // Cache is applied in useEffect so client updates after first paint.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    const unsubscribe = onAuthChange((firebaseUser) => {
      if (firebaseUser) {
        const u: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          isAnonymous: firebaseUser.isAnonymous,
        };
        setUser(u);
        writeCache(u);
      } else {
        setUser(null);
        writeCache(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
};
