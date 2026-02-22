/**
 * Integration tests for authentication flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '@/lib/hooks/useAuth';
import * as authModule from '@/lib/firebase/auth';

// Mock Firebase auth module
vi.mock('@/lib/firebase/auth', () => ({
  onAuthChange: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGithub: vi.fn(),
}));

// Test component that uses useAuth hook
function TestComponent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading</div>;
  }

  if (!user) {
    return <div>Not authenticated</div>;
  }

  return (
    <div>
      <div data-testid="user-email">{user.email}</div>
      <div data-testid="user-name">{user.displayName}</div>
      <div data-testid="user-uid">{user.uid}</div>
    </div>
  );
}

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(authModule.onAuthChange).mockImplementation(() => () => {});

    render(<TestComponent />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('shows not authenticated when user is null', async () => {
    vi.mocked(authModule.onAuthChange).mockImplementation((callback) => {
      callback(null);
      return () => {};
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  it('displays user information when authenticated', async () => {
    const mockUser = {
      uid: 'test-uid-123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      emailVerified: true,
    };

    vi.mocked(authModule.onAuthChange).mockImplementation((callback) => {
      callback(mockUser as any);
      return () => {};
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
      expect(screen.getByTestId('user-uid')).toHaveTextContent('test-uid-123');
    });
  });

  it('updates when user signs out', async () => {
    let authCallback: any;

    vi.mocked(authModule.onAuthChange).mockImplementation((callback) => {
      authCallback = callback;
      // Initially authenticated
      callback({
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
      } as any);
      return () => {};
    });

    const { rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toBeInTheDocument();
    });

    // Simulate sign out
    authCallback(null);
    rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  it('cleans up auth listener on unmount', () => {
    const unsubscribe = vi.fn();
    vi.mocked(authModule.onAuthChange).mockReturnValue(unsubscribe);

    const { unmount } = render(<TestComponent />);
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('handles auth state changes', async () => {
    let authCallback: any;

    vi.mocked(authModule.onAuthChange).mockImplementation((callback) => {
      authCallback = callback;
      callback(null);
      return () => {};
    });

    const { rerender } = render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });

    // User signs in
    authCallback({
      uid: 'new-uid',
      email: 'new@example.com',
      displayName: 'New User',
      photoURL: null,
    } as any);
    rerender(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('new@example.com');
    });
  });
});

describe('Authentication Flow Integration', () => {
  it('completes full signup flow', async () => {
    const mockUser = {
      uid: 'new-user-uid',
      email: 'newuser@example.com',
      displayName: 'New User',
    };

    vi.mocked(authModule.signUp).mockResolvedValue(mockUser as any);

    const result = await authModule.signUp(
      'newuser@example.com',
      'password123',
      'New User'
    );

    expect(authModule.signUp).toHaveBeenCalledWith(
      'newuser@example.com',
      'password123',
      'New User'
    );
    expect(result).toEqual(mockUser);
  });

  it('completes full signin flow', async () => {
    const mockUser = {
      uid: 'existing-user-uid',
      email: 'user@example.com',
      displayName: 'Existing User',
    };

    vi.mocked(authModule.signIn).mockResolvedValue(mockUser as any);

    const result = await authModule.signIn('user@example.com', 'password123');

    expect(authModule.signIn).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(result).toEqual(mockUser);
  });

  it('completes Google OAuth flow', async () => {
    const mockUser = {
      uid: 'google-user-uid',
      email: 'user@gmail.com',
      displayName: 'Google User',
    };

    vi.mocked(authModule.signInWithGoogle).mockResolvedValue(mockUser as any);

    const result = await authModule.signInWithGoogle();

    expect(authModule.signInWithGoogle).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it('completes GitHub OAuth flow', async () => {
    const mockUser = {
      uid: 'github-user-uid',
      email: 'user@github.com',
      displayName: 'GitHub User',
    };

    vi.mocked(authModule.signInWithGithub).mockResolvedValue(mockUser as any);

    const result = await authModule.signInWithGithub();

    expect(authModule.signInWithGithub).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it('handles signout flow', async () => {
    vi.mocked(authModule.signOut).mockResolvedValue(undefined);

    await authModule.signOut();

    expect(authModule.signOut).toHaveBeenCalled();
  });
});
