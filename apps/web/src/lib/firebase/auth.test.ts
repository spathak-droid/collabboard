/**
 * Test cases for Firebase Auth utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as firebaseAuth from 'firebase/auth';
import {
  signUp,
  signIn,
  signInWithGoogle,
  signInWithGithub,
  signOut,
  getCurrentUser,
  getIdToken,
} from './auth';

// Mock Firebase Auth
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  sendEmailVerification: vi.fn(),
  onAuthStateChanged: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  GithubAuthProvider: vi.fn(),
}));

// Mock Firebase config
vi.mock('./config', () => ({
  getFirebaseAuth: vi.fn(() => ({
    currentUser: null,
  })),
}));

import * as firebaseConfig from './config';

describe('Firebase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getFirebaseAuth for all tests
    vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
      currentUser: null,
    } as any);
  });

  describe('signUp', () => {
    it('creates user with email and password', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: null,
      };

      const mockUserCredential = {
        user: mockUser,
      };

      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue(
        mockUserCredential as any
      );
      vi.mocked(firebaseAuth.updateProfile).mockResolvedValue(undefined);
      vi.mocked(firebaseAuth.sendEmailVerification).mockResolvedValue(undefined);

      const result = await signUp('test@example.com', 'password123', 'Test User');

      expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123'
      );
      expect(firebaseAuth.updateProfile).toHaveBeenCalledWith(mockUser, {
        displayName: 'Test User',
      });
      expect(firebaseAuth.sendEmailVerification).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockUser);
    });

    it('throws error when signup fails', async () => {
      const error = new Error('Email already in use');
      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockRejectedValue(error);

      await expect(signUp('test@example.com', 'password123', 'Test User')).rejects.toThrow(
        'Email already in use'
      );
    });

    it('updates display name after user creation', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: null,
      };

      vi.mocked(firebaseAuth.createUserWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      } as any);
      vi.mocked(firebaseAuth.updateProfile).mockResolvedValue(undefined);
      vi.mocked(firebaseAuth.sendEmailVerification).mockResolvedValue(undefined);

      await signUp('test@example.com', 'password123', 'John Doe');

      expect(firebaseAuth.updateProfile).toHaveBeenCalledWith(mockUser, {
        displayName: 'John Doe',
      });
      expect(firebaseAuth.sendEmailVerification).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('signIn', () => {
    it('signs in user with email and password', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockResolvedValue({
        user: mockUser,
      } as any);

      const result = await signIn('test@example.com', 'password123');

      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123'
      );
      expect(result).toEqual(mockUser);
    });

    it('throws error when credentials are invalid', async () => {
      const error = new Error('Invalid credentials');
      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue(error);

      await expect(signIn('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('handles empty email', async () => {
      const error = new Error('Email is required');
      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue(error);

      await expect(signIn('', 'password123')).rejects.toThrow();
    });

    it('handles empty password', async () => {
      const error = new Error('Password is required');
      vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue(error);

      await expect(signIn('test@example.com', '')).rejects.toThrow();
    });
  });

  describe('signInWithGoogle', () => {
    it('signs in user with Google OAuth', async () => {
      const mockUser = {
        uid: 'google-uid',
        email: 'user@gmail.com',
        displayName: 'Google User',
        photoURL: 'https://example.com/photo.jpg',
      };

      vi.mocked(firebaseAuth.signInWithPopup).mockResolvedValue({
        user: mockUser,
      } as any);

      const result = await signInWithGoogle();

      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(firebaseAuth.GoogleAuthProvider)
      );
      expect(result).toEqual(mockUser);
    });

    it('throws error when Google signin is cancelled', async () => {
      const error = new Error('Popup closed by user');
      vi.mocked(firebaseAuth.signInWithPopup).mockRejectedValue(error);

      await expect(signInWithGoogle()).rejects.toThrow('Popup closed by user');
    });

    it('handles network errors during Google signin', async () => {
      const error = new Error('Network error');
      vi.mocked(firebaseAuth.signInWithPopup).mockRejectedValue(error);

      await expect(signInWithGoogle()).rejects.toThrow('Network error');
    });
  });

  describe('signInWithGithub', () => {
    it('signs in user with GitHub OAuth', async () => {
      const mockUser = {
        uid: 'github-uid',
        email: 'user@github.com',
        displayName: 'GitHub User',
        photoURL: 'https://github.com/avatar.jpg',
      };

      vi.mocked(firebaseAuth.signInWithPopup).mockResolvedValue({
        user: mockUser,
      } as any);

      const result = await signInWithGithub();

      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(firebaseAuth.GithubAuthProvider)
      );
      expect(result).toEqual(mockUser);
    });

    it('throws error when GitHub signin fails', async () => {
      const error = new Error('OAuth error');
      vi.mocked(firebaseAuth.signInWithPopup).mockRejectedValue(error);

      await expect(signInWithGithub()).rejects.toThrow('OAuth error');
    });
  });

  describe('signOut', () => {
    it('signs out current user', async () => {
      vi.mocked(firebaseAuth.signOut).mockResolvedValue(undefined);

      await signOut();

      expect(firebaseAuth.signOut).toHaveBeenCalledWith(expect.anything());
    });

    it('handles signout errors', async () => {
      const error = new Error('Signout failed');
      vi.mocked(firebaseAuth.signOut).mockRejectedValue(error);

      await expect(signOut()).rejects.toThrow('Signout failed');
    });
  });

  describe('getCurrentUser', () => {
    it('returns current user when authenticated', () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: mockUser,
      } as any);

      const result = getCurrentUser();
      expect(result).toEqual(mockUser);
    });

    it('returns null when not authenticated', () => {
      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: null,
      } as any);

      const result = getCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('getIdToken', () => {
    it('returns ID token for authenticated user', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        getIdToken: vi.fn().mockResolvedValue('mock-token-123'),
      };

      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: mockUser,
      } as any);

      const token = await getIdToken();

      expect(mockUser.getIdToken).toHaveBeenCalled();
      expect(token).toBe('mock-token-123');
    });

    it('returns null when user is not authenticated', async () => {
      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: null,
      } as any);

      const token = await getIdToken();
      expect(token).toBeNull();
    });

    it('handles token refresh', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        getIdToken: vi.fn()
          .mockResolvedValueOnce('old-token')
          .mockResolvedValueOnce('new-token'),
      };

      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: mockUser,
      } as any);

      const token1 = await getIdToken();
      const token2 = await getIdToken();

      expect(token1).toBe('old-token');
      expect(token2).toBe('new-token');
      expect(mockUser.getIdToken).toHaveBeenCalledTimes(2);
    });

    it('handles token fetch errors', async () => {
      const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        getIdToken: vi.fn().mockRejectedValue(new Error('Token expired')),
      };

      vi.spyOn(firebaseConfig, 'getFirebaseAuth').mockReturnValue({
        currentUser: mockUser,
      } as any);

      await expect(getIdToken()).rejects.toThrow('Token expired');
    });
  });
});
